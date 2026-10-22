import 'server-only';

import {
  createSupabaseServerClient,
  createSupabaseServerClientWritable,
} from '@/lib/supabase/server';
import type { AuthFormState } from '@/lib/auth/validation';

/**
 * Authentication, profile and address persistence.
 *
 * -----------------------------------------------------------------------------
 * WHICH CLIENT, AND WHY IT MATTERS
 * -----------------------------------------------------------------------------
 *
 * Every call here goes through the request-scoped, anon-key client. That is not
 * incidental. The Supabase Auth endpoints mutate the *session*, and the session
 * is a cookie; only the cookie-aware client persists it. Using the service-role
 * client (`lib/supabase/admin.ts`) would authenticate the *call* but not the
 * *caller* — it cannot establish a user session, and it would bypass the RLS
 * policies that make a customer's own rows the only rows they can reach.
 *
 * Two variants are used, matching `lib/supabase/server.ts`:
 *
 *   * the writable client in sign-in, sign-out, registration and password
 *     change, because those calls set or clear cookies and Next.js only permits
 *     that in an action or a route handler;
 *   * the read-only client for plain reads, which is safe anywhere.
 *
 * -----------------------------------------------------------------------------
 * WHAT IS NOT DONE HERE
 * -----------------------------------------------------------------------------
 *
 * Passwords are never hashed, stored, compared or logged by this module. They
 * are handed to Supabase Auth, which hashes them with bcrypt. There is no code
 * path in this repository that sees a stored password.
 */

export type AuthUser = {
  id: string;
  email: string | null;
  /** Whether the address has been confirmed. Unconfirmed users may not sign in. */
  emailConfirmed: boolean;
};

export type Profile = {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  marketingOptIn: boolean;
};

export type Address = {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  countryCode: string;
  isDefault: boolean;
};

/**
 * The signed-in user, or `null`.
 *
 * `getUser()` is used rather than `getSession()`. `getSession()` reads and
 * trusts the cookie's contents; `getUser()` sends the token to the auth server
 * and has it validated. A forged cookie therefore fails here, which is the
 * property every authorisation check downstream depends on.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    emailConfirmed: Boolean(data.user.email_confirmed_at ?? data.user.confirmed_at),
  };
}

/** Register a new customer. Returns a state rather than throwing. */
export async function signUpWithPassword(input: {
  email: string;
  password: string;
  fullName?: string;
  emailRedirectTo: string;
}): Promise<AuthFormState> {
  const supabase = await createSupabaseServerClientWritable();

  const { error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: input.emailRedirectTo,
      // The `handle_new_user` trigger (0002) reads this and writes the name onto
      // the profile it creates. Passing it here rather than updating the profile
      // afterwards means the name is set in the same transaction that creates
      // the account, so there is no window in which the account exists nameless.
      data: input.fullName ? { full_name: input.fullName } : undefined,
    },
  });

  if (error) return mapAuthError(error.message);

  return {
    status: 'success',
    message: 'Check your inbox — we have sent you a link to confirm your email address.',
  };
}

/**
 * Sign in with email and password.
 *
 * Supabase returns the same error for an unknown address and a wrong password,
 * and this function preserves that: `mapAuthError` maps both to one message. The
 * caller cannot accidentally leak the distinction because the distinction is
 * never available here.
 */
export async function signInWithPassword(input: {
  email: string;
  password: string;
}): Promise<AuthFormState> {
  const supabase = await createSupabaseServerClientWritable();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error) return mapAuthError(error.message);

  // Supabase permits a session for an unconfirmed address when email
  // confirmation is disabled. Treating it as a failure here would be wrong for a
  // project that never turned confirmation on, so the check is driven by the
  // user record rather than assumed. When confirmation *is* required, Supabase
  // returns an error above and this is not reached.
  if (data.user && !data.user.email_confirmed_at && !data.user.confirmed_at) {
    // Sign the half-session back out: leaving it would let an unconfirmed
    // account read account pages that assume a confirmed address.
    await supabase.auth.signOut();
    return {
      status: 'error',
      message: 'Confirm your email address first — check your inbox for the link.',
    };
  }

  return { status: 'success' };
}

/** Clear the session cookie. */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClientWritable();
  await supabase.auth.signOut();
}

/**
 * Send a password-reset email.
 *
 * Always reports success, whatever happened. Reporting "no such account" would
 * turn this form into the enumeration oracle the module comment warns about, and
 * the caller has no way to use the difference legitimately.
 */
export async function requestPasswordReset(input: {
  email: string;
  redirectTo: string;
}): Promise<AuthFormState> {
  const supabase = await createSupabaseServerClientWritable();

  await supabase.auth.resetPasswordForEmail(input.email, { redirectTo: input.redirectTo });

  return {
    status: 'success',
    message: 'If an account exists for that address, we have sent a link to reset the password.',
  };
}

/**
 * Set a new password for the signed-in user.
 *
 * The recovery link lands the browser in a session scoped to the reset, so
 * `updateUser` is the correct call: it changes the password of whoever the
 * session belongs to, and the session is established by the emailed token, not
 * by anything the form submits.
 */
export async function updatePassword(password: string): Promise<AuthFormState> {
  const supabase = await createSupabaseServerClientWritable();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return mapAuthError(error.message);

  return { status: 'success', message: 'Your password has been updated.' };
}

/**
 * Change the password of a signed-in user, verifying the current one first.
 *
 * Supabase's `updateUser` does not ask for the existing password. Without this
 * check, anyone who found an unlocked, signed-in browser could silently change
 * the password and lock the owner out — so the current password is verified by
 * re-authenticating before the change is made.
 */
export async function changePassword(input: {
  email: string;
  currentPassword: string;
  newPassword: string;
}): Promise<AuthFormState> {
  const supabase = await createSupabaseServerClientWritable();

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.currentPassword,
  });

  if (verifyError) {
    return { status: 'error', fieldErrors: { currentPassword: 'That password is not correct.' } };
  }

  const { error } = await supabase.auth.updateUser({ password: input.newPassword });
  if (error) return mapAuthError(error.message);

  return { status: 'success', message: 'Your password has been updated.' };
}

/** Re-send the confirmation email for an unconfirmed address. */
export async function resendConfirmation(input: {
  email: string;
  emailRedirectTo: string;
}): Promise<AuthFormState> {
  const supabase = await createSupabaseServerClientWritable();

  await supabase.auth.resend({
    type: 'signup',
    email: input.email,
    options: { emailRedirectTo: input.emailRedirectTo },
  });

  // Reported as success for the same reason as the reset: the answer must not
  // reveal whether the address is registered.
  return {
    status: 'success',
    message: 'If that address needs confirming, we have sent a new link.',
  };
}

/**
 * The signed-in customer's profile row.
 *
 * Read through the request-scoped client, so `profiles_select_own` scopes it to
 * `auth.uid()`. The `user_id` filter is kept as well: relying on RLS alone would
 * mean a policy mistake silently returned another customer's profile rather than
 * returning nothing.
 */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, marketing_opt_in')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    email: data.email ?? null,
    fullName: data.full_name ?? null,
    phone: data.phone ?? null,
    marketingOptIn: data.marketing_opt_in,
  };
}

/**
 * Update the customer's own profile.
 *
 * The column list is fixed here, and `email` is deliberately absent: changing
 * the address a customer signs in with is an auth operation with its own
 * confirmation flow, not a profile edit. Writing it here would let a typo lock
 * someone out of their own account.
 */
export async function updateProfile(
  userId: string,
  input: { fullName?: string; phone?: string; marketingOptIn: boolean },
): Promise<void> {
  const supabase = await createSupabaseServerClientWritable();

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: input.fullName ?? null,
      phone: input.phone ?? null,
      marketing_opt_in: input.marketingOptIn,
    })
    .eq('id', userId);

  if (error) throw error;
}

/** The customer's saved addresses, default first. */
export async function fetchAddresses(userId: string): Promise<Address[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('addresses')
    .select(
      'id, label, recipient_name, phone, line1, line2, city, region, postal_code, country_code, is_default',
    )
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.label ?? null,
    recipientName: row.recipient_name,
    phone: row.phone ?? null,
    line1: row.line1,
    line2: row.line2 ?? null,
    city: row.city,
    region: row.region ?? null,
    postalCode: row.postal_code ?? null,
    countryCode: row.country_code,
    isDefault: row.is_default,
  }));
}

/**
 * Insert an address, optionally making it the default.
 *
 * Clearing the previous default and setting the new one is two statements, and
 * Postgres gives no ordering guarantee that would make them atomic without a
 * transaction. The failure mode if the second fails is a customer with no
 * default address, which the account page renders honestly (it shows the list
 * with nothing marked default) and which the next save repairs. That is a better
 * trade than a partial-unique-index migration for a cosmetic flag.
 */
export async function createAddress(
  userId: string,
  input: {
    label?: string;
    recipientName: string;
    phone?: string;
    line1: string;
    line2?: string;
    city: string;
    region?: string;
    postalCode?: string;
    countryCode: string;
    isDefault: boolean;
  },
): Promise<void> {
  const supabase = await createSupabaseServerClientWritable();

  if (input.isDefault) {
    await supabase.from('addresses').update({ is_default: false }).eq('user_id', userId);
  }

  const { error } = await supabase.from('addresses').insert({
    user_id: userId,
    label: input.label ?? null,
    recipient_name: input.recipientName,
    phone: input.phone ?? null,
    line1: input.line1,
    line2: input.line2 ?? null,
    city: input.city,
    region: input.region ?? null,
    postal_code: input.postalCode ?? null,
    country_code: input.countryCode,
    is_default: input.isDefault,
  });

  if (error) throw error;
}

/**
 * Update an address the customer owns.
 *
 * The `user_id` filter is the authorisation check. RLS enforces it too, but
 * scoping the statement means an id belonging to someone else matches no row and
 * changes nothing, rather than depending on the policy alone.
 */
export async function updateAddress(
  userId: string,
  addressId: string,
  input: {
    label?: string;
    recipientName: string;
    phone?: string;
    line1: string;
    line2?: string;
    city: string;
    region?: string;
    postalCode?: string;
    countryCode: string;
    isDefault: boolean;
  },
): Promise<void> {
  const supabase = await createSupabaseServerClientWritable();

  if (input.isDefault) {
    await supabase
      .from('addresses')
      .update({ is_default: false })
      .eq('user_id', userId)
      .neq('id', addressId);
  }

  const { error } = await supabase
    .from('addresses')
    .update({
      label: input.label ?? null,
      recipient_name: input.recipientName,
      phone: input.phone ?? null,
      line1: input.line1,
      line2: input.line2 ?? null,
      city: input.city,
      region: input.region ?? null,
      postal_code: input.postalCode ?? null,
      country_code: input.countryCode,
      is_default: input.isDefault,
    })
    .eq('id', addressId)
    .eq('user_id', userId);

  if (error) throw error;
}

/** Delete an address the customer owns. */
export async function deleteAddress(userId: string, addressId: string): Promise<void> {
  const supabase = await createSupabaseServerClientWritable();
  const { error } = await supabase
    .from('addresses')
    .delete()
    .eq('id', addressId)
    .eq('user_id', userId);

  if (error) throw error;
}

/**
 * Map a Supabase Auth error message to a customer-facing state.
 *
 * An allowlist, not a denylist, following `lib/orders/order-request.ts`. Supabase
 * error text is generally safe, but "generally" is not a guarantee, and an
 * unexpected message could name a table or a policy. Anything not recognised
 * becomes one generic failure.
 *
 * The sign-in and reset messages are identical for "unknown user" and "wrong
 * password" on purpose — see the module comment.
 */
function mapAuthError(message: string): AuthFormState {
  const normalised = message.toLowerCase();

  if (normalised.includes('invalid login credentials')) {
    return {
      status: 'error',
      message: 'That email address and password do not match an account.',
    };
  }

  if (normalised.includes('email not confirmed')) {
    return {
      status: 'error',
      message: 'Confirm your email address first — check your inbox for the link.',
    };
  }

  if (normalised.includes('already registered') || normalised.includes('already exists')) {
    // Registration is the one place the distinction is unavoidable: the form
    // cannot both create the account and hide that it existed. The message is
    // phrased so it also reads correctly to the legitimate owner who forgot they
    // had an account.
    return {
      status: 'error',
      fieldErrors: { email: 'An account already exists for that address. Try signing in.' },
    };
  }

  if (normalised.includes('password should be') || normalised.includes('password is too short')) {
    return { status: 'error', fieldErrors: { password: 'Use at least 12 characters.' } };
  }

  if (normalised.includes('rate limit') || normalised.includes('too many')) {
    return {
      status: 'error',
      message: 'Too many attempts. Please wait a few minutes and try again.',
    };
  }

  if (normalised.includes('email address') && normalised.includes('invalid')) {
    return { status: 'error', fieldErrors: { email: 'Enter a valid email address.' } };
  }

  return {
    status: 'error',
    message: 'We could not complete that request. Please try again.',
  };
}
