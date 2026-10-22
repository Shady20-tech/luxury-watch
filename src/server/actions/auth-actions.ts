'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { isSupabaseConfigured, getPublicEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { safeRedirectPathFromForm } from '@/lib/auth/redirect';
import {
  addressSchema,
  authFieldErrors,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  profileSchema,
  registerSchema,
  resetPasswordSchema,
  type AuthFormState,
} from '@/lib/auth/validation';
import { mergeGuestCart } from '@/server/actions/cart-actions';
import {
  changePassword,
  createAddress,
  deleteAddress,
  getAuthUser,
  requestPasswordReset,
  resendConfirmation,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  updateAddress,
  updatePassword,
  updateProfile,
} from '@/server/repositories/auth-repository';

/**
 * Authentication and account server actions.
 *
 * Every action here follows the same shape as the cart and wishlist actions: read
 * the form, validate with Zod, check the caller is allowed, do the work, map any
 * failure to a safe message. Nothing thrown reaches the client.
 *
 * -----------------------------------------------------------------------------
 * AUTHORISATION IS RE-CHECKED, NOT ASSUMED
 * -----------------------------------------------------------------------------
 *
 * A Server Action is a public HTTP endpoint. Hiding the form that calls it does
 * not stop anyone posting to it. So every action that touches a customer's data
 * resolves the user from the session itself — `requireUser()` — and never trusts
 * a user id, an email or a role from the form. The database enforces the same
 * rule through RLS; this is the second lock on the same door.
 */

const CONFIGURATION_ERROR: AuthFormState = {
  status: 'error',
  message: 'Accounts are temporarily unavailable. Please try again shortly.',
};

/**
 * The signed-in user, or a redirect to the sign-in page.
 *
 * `redirect` throws, so a caller that reaches the line after this call has a
 * user. The redirect target is a fixed path rather than a value from the form,
 * so this cannot be turned into an open redirect.
 */
async function requireUser() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  return user;
}

/** Build an absolute URL for an email link from the configured site URL. */
function absoluteUrl(path: string): string {
  const { siteUrl } = getPublicEnv();
  const base = siteUrl.replace(/\/$/, '');
  return `${base}${path}`;
}

// -----------------------------------------------------------------------------
// Registration, sign-in, sign-out
// -----------------------------------------------------------------------------

export async function registerAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  });

  if (!parsed.success) {
    return { status: 'error', fieldErrors: authFieldErrors(parsed.error.issues) };
  }

  if (!isSupabaseConfigured()) return CONFIGURATION_ERROR;

  try {
    const result = await signUpWithPassword({
      ...parsed.data,
      emailRedirectTo: absoluteUrl('/auth/callback?next=/account'),
    });

    // A successful registration leaves the customer signed out until they
    // confirm, so there is nothing to merge yet. The merge happens on the first
    // successful sign-in instead.
    if (result.status === 'success') {
      // The address is not logged: it is personal data, and the event name is
      // enough to count registrations without keeping a list of who signed up.
      logger.info('auth.register', { outcome: 'confirmation_sent' });
    }

    return result;
  } catch (error) {
    return unexpected('auth.register_failed', error);
  }
}

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { status: 'error', fieldErrors: authFieldErrors(parsed.error.issues) };
  }

  if (!isSupabaseConfigured()) return CONFIGURATION_ERROR;

  let result: AuthFormState;
  try {
    result = await signInWithPassword(parsed.data);
  } catch (error) {
    return unexpected('auth.login_failed', error);
  }

  if (result.status !== 'success') return result;

  // The guest cart is merged now, once, on the transition from signed-out to
  // signed-in. It can be done here because the guest cart's identity is an
  // httpOnly cookie, which the server can read and clear in this same request.
  // A failure must not block a successful sign-in, so the result is ignored; the
  // guest cart is left intact and `mergeGuestCart` retries on the next sign-in.
  try {
    await mergeGuestCart();
  } catch (error) {
    logger.warn('auth.merge_cart_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }

  // The guest *wishlist* is not merged here. It lives in `localStorage`, which
  // only the browser can read or clear, and a server action cannot touch it.
  // `WishlistMerge` (components/wishlist/wishlist-merge.tsx) performs that merge
  // on the wishlist page and clears the browser copy on success. Merging it
  // here as well would be a second, unnecessary round trip for the same rows.

  const next = safeRedirectPathFromForm(formData.get('next'));
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  try {
    await signOut();
  } catch (error) {
    // Sign-out failing is not worth blocking on: the redirect below sends the
    // customer to a public page either way, and a stale cookie is corrected by
    // the next sign-in.
    logger.warn('auth.logout_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }

  redirect('/');
}

// -----------------------------------------------------------------------------
// Email confirmation and password recovery
// -----------------------------------------------------------------------------

export async function forgotPasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') });

  if (!parsed.success) {
    return { status: 'error', fieldErrors: authFieldErrors(parsed.error.issues) };
  }

  if (!isSupabaseConfigured()) return CONFIGURATION_ERROR;

  try {
    return await requestPasswordReset({
      email: parsed.data.email,
      redirectTo: absoluteUrl('/auth/callback?next=/reset-password'),
    });
  } catch (error) {
    return unexpected('auth.reset_request_failed', error);
  }
}

export async function resetPasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    return { status: 'error', fieldErrors: authFieldErrors(parsed.error.issues) };
  }

  if (!isSupabaseConfigured()) return CONFIGURATION_ERROR;

  // The recovery link puts the browser in a session before this page renders, so
  // reaching here without one means the link expired or was never used. Saying
  // so is more useful than a generic failure, and it leaks nothing.
  const user = await getAuthUser();
  if (!user) {
    return {
      status: 'error',
      message: 'That reset link has expired. Request a new one and try again.',
    };
  }

  try {
    return await updatePassword(parsed.data.password);
  } catch (error) {
    return unexpected('auth.reset_failed', error);
  }
}

export async function resendConfirmationAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') });

  if (!parsed.success) {
    return { status: 'error', fieldErrors: authFieldErrors(parsed.error.issues) };
  }

  if (!isSupabaseConfigured()) return CONFIGURATION_ERROR;

  try {
    return await resendConfirmation({
      email: parsed.data.email,
      emailRedirectTo: absoluteUrl('/auth/callback?next=/account'),
    });
  } catch (error) {
    return unexpected('auth.resend_failed', error);
  }
}

export async function changePasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    return { status: 'error', fieldErrors: authFieldErrors(parsed.error.issues) };
  }

  if (!isSupabaseConfigured()) return CONFIGURATION_ERROR;

  const user = await requireUser();
  if (!user.email) {
    return {
      status: 'error',
      message: 'Your account has no email address, so the password cannot be changed here.',
    };
  }

  try {
    return await changePassword({
      email: user.email,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.password,
    });
  } catch (error) {
    return unexpected('auth.change_password_failed', error);
  }
}

// -----------------------------------------------------------------------------
// Profile
// -----------------------------------------------------------------------------

export async function updateProfileAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = profileSchema.safeParse({
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    // An unchecked checkbox is absent from the form data entirely, so its
    // absence is the false case.
    marketingOptIn: formData.get('marketingOptIn') === 'on',
  });

  if (!parsed.success) {
    return { status: 'error', fieldErrors: authFieldErrors(parsed.error.issues) };
  }

  if (!isSupabaseConfigured()) return CONFIGURATION_ERROR;

  const user = await requireUser();

  try {
    await updateProfile(user.id, parsed.data);
    // The account header shows the name, so the cached render is stale.
    revalidatePath('/account', 'layout');
    return { status: 'success', message: 'Your details have been saved.' };
  } catch (error) {
    return unexpected('auth.profile_update_failed', error);
  }
}

// -----------------------------------------------------------------------------
// Addresses
// -----------------------------------------------------------------------------

function readAddressForm(formData: FormData) {
  return addressSchema.safeParse({
    label: formData.get('label'),
    recipientName: formData.get('recipientName'),
    phone: formData.get('phone'),
    line1: formData.get('line1'),
    line2: formData.get('line2'),
    city: formData.get('city'),
    region: formData.get('region'),
    postalCode: formData.get('postalCode'),
    countryCode: formData.get('countryCode'),
    isDefault: formData.get('isDefault') === 'on',
  });
}

export async function createAddressAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = readAddressForm(formData);
  if (!parsed.success) {
    return { status: 'error', fieldErrors: authFieldErrors(parsed.error.issues) };
  }

  if (!isSupabaseConfigured()) return CONFIGURATION_ERROR;

  const user = await requireUser();

  try {
    await createAddress(user.id, parsed.data);
    revalidatePath('/account/addresses');
    return { status: 'success', message: 'Address saved.' };
  } catch (error) {
    return unexpected('auth.address_create_failed', error);
  }
}

export async function updateAddressAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const addressId = formData.get('addressId');
  if (typeof addressId !== 'string' || addressId.length === 0) {
    return { status: 'error', message: 'That address could not be identified.' };
  }

  const parsed = readAddressForm(formData);
  if (!parsed.success) {
    return { status: 'error', fieldErrors: authFieldErrors(parsed.error.issues) };
  }

  if (!isSupabaseConfigured()) return CONFIGURATION_ERROR;

  const user = await requireUser();

  try {
    // The repository scopes the update to `user_id = user.id`, so an id that
    // belongs to another customer changes nothing rather than being refused —
    // which also means the response does not reveal whether the id exists.
    await updateAddress(user.id, addressId, parsed.data);
    revalidatePath('/account/addresses');
    return { status: 'success', message: 'Address updated.' };
  } catch (error) {
    return unexpected('auth.address_update_failed', error);
  }
}

export async function deleteAddressAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const addressId = formData.get('addressId');
  if (typeof addressId !== 'string' || addressId.length === 0) {
    return { status: 'error', message: 'That address could not be identified.' };
  }

  if (!isSupabaseConfigured()) return CONFIGURATION_ERROR;

  const user = await requireUser();

  try {
    await deleteAddress(user.id, addressId);
    revalidatePath('/account/addresses');
    return { status: 'success', message: 'Address removed.' };
  } catch (error) {
    return unexpected('auth.address_delete_failed', error);
  }
}

/**
 * Log the real cause and return a generic state.
 *
 * The detail goes to the server log; the customer sees one sentence. A raw
 * Supabase or Postgres error can name a table, a constraint or a policy.
 */
function unexpected(event: string, error: unknown): AuthFormState {
  logger.error(event, {
    message: error instanceof Error ? error.message : String(error),
  });
  return {
    status: 'error',
    message: 'Something went wrong on our side. Please try again.',
  };
}
