'use client';

import type {
  AdminDeliveryOption,
  AdminPaymentMethod,
  AdminSiteSettings,
} from '@/server/repositories/admin-content-repository';
import {
  saveDeliveryOptionAction,
  savePaymentMethodAction,
  saveSiteSettingsAction,
} from '@/server/actions/content-actions';

import { AdminForm, CheckboxField, TextAreaField, TextField } from './form-kit';

/**
 * The settings editors.
 *
 * These require `settings.write`, which `CONTENT_MANAGER` does not hold. The page
 * that mounts them has checked that permission and the actions check it again;
 * the database's own policies on `site_settings`, `payment_methods` and
 * `delivery_options` require the same permission, so all three agree.
 */

export function PaymentMethodEditor({ methods }: { methods: AdminPaymentMethod[] }) {
  if (methods.length === 0) {
    return (
      <p className="text-ink-500 text-sm">
        No payment methods exist. They are created by the database seed; run the migrations to
        restore them.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {methods.map((method) => (
        <section
          key={method.id}
          aria-labelledby={`payment-${method.id}`}
          className="border-line-300 rounded-md border p-6"
        >
          <h2 id={`payment-${method.id}`} className="mb-1 text-lg">
            {method.label}
          </h2>
          <p className="text-ink-500 mb-4 font-mono text-xs">{method.code}</p>

          <AdminForm
            action={savePaymentMethodAction}
            submitLabel="Save method"
            hidden={{ id: method.id }}
          >
            <TextField
              name="label"
              label="Label"
              required
              maxLength={120}
              defaultValue={method.label}
            />
            <TextField
              name="description"
              label="Short description"
              maxLength={500}
              defaultValue={method.description}
            />
            <TextAreaField
              name="instructions"
              label="Instructions shown to the customer"
              rows={5}
              maxLength={2000}
              hint="Say what the customer does next. Never state that payment has been taken — it has not, until an administrator settles it."
              defaultValue={method.instructions}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                name="sortOrder"
                label="Order"
                type="number"
                defaultValue={method.sortOrder}
              />
              <div className="flex items-end pb-2">
                <CheckboxField
                  name="isEnabled"
                  label="Offer this method at checkout"
                  defaultChecked={method.isEnabled}
                />
              </div>
            </div>
          </AdminForm>
        </section>
      ))}
    </div>
  );
}

export function DeliveryOptionEditor({ options }: { options: AdminDeliveryOption[] }) {
  if (options.length === 0) {
    return (
      <p className="text-ink-500 text-sm">
        No delivery options exist. They are created by the database seed; run the migrations to
        restore them.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {options.map((option) => (
        <section
          key={option.id}
          aria-labelledby={`delivery-${option.id}`}
          className="border-line-300 rounded-md border p-6"
        >
          <h2 id={`delivery-${option.id}`} className="mb-1 text-lg">
            {option.label}
          </h2>
          <p className="text-ink-500 mb-4 font-mono text-xs">{option.code}</p>

          <AdminForm
            action={saveDeliveryOptionAction}
            submitLabel="Save option"
            hidden={{ id: option.id }}
          >
            <TextField
              name="label"
              label="Label"
              required
              maxLength={120}
              defaultValue={option.label}
            />
            <TextField
              name="description"
              label="Short description"
              maxLength={500}
              defaultValue={option.description}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                name="feeMajor"
                label="Fee"
                type="number"
                hint="In whole currency units, for example 25 or 0 for free."
                defaultValue={(option.feeCents / 100).toFixed(2)}
              />
              <TextField
                name="sortOrder"
                label="Order"
                type="number"
                defaultValue={option.sortOrder}
              />
            </div>
            <CheckboxField
              name="isEnabled"
              label="Offer this option at checkout"
              defaultChecked={option.isEnabled}
            />
          </AdminForm>
        </section>
      ))}
    </div>
  );
}

export function SiteSettingsEditor({ settings }: { settings: AdminSiteSettings | null }) {
  if (!settings) {
    return (
      <p className="text-ink-500 text-sm">
        No site settings row exists. It is created by the database seed; run the migrations to
        restore it.
      </p>
    );
  }

  return (
    <AdminForm action={saveSiteSettingsAction} submitLabel="Save settings">
      <fieldset className="border-line-300 space-y-4 rounded-md border p-6">
        <legend className="px-2 text-sm font-semibold">Identity</legend>
        <TextField
          name="businessName"
          label="Business name"
          required
          maxLength={120}
          defaultValue={settings.businessName}
        />
        <TextField name="tagline" label="Tagline" maxLength={200} defaultValue={settings.tagline} />
        <TextField
          name="logoUrl"
          label="Logo URL"
          hint="Upload a logo in the media library, then paste its public URL here."
          defaultValue={settings.logoUrl}
        />
      </fieldset>

      <fieldset className="border-line-300 space-y-4 rounded-md border p-6">
        <legend className="px-2 text-sm font-semibold">Contact</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="contactEmail"
            label="Email"
            type="email"
            maxLength={254}
            defaultValue={settings.contactEmail}
          />
          <TextField
            name="contactPhone"
            label="Phone"
            maxLength={40}
            defaultValue={settings.contactPhone}
          />
        </div>
        <TextField
          name="whatsappUrl"
          label="WhatsApp URL"
          hint="A full https:// URL that opens a chat."
          defaultValue={settings.whatsappUrl}
        />
      </fieldset>

      <fieldset className="border-line-300 space-y-4 rounded-md border p-6">
        <legend className="px-2 text-sm font-semibold">Address</legend>
        <TextField
          name="addressLine1"
          label="Line 1"
          maxLength={200}
          defaultValue={settings.addressLine1}
        />
        <TextField
          name="addressLine2"
          label="Line 2"
          maxLength={200}
          defaultValue={settings.addressLine2}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="addressCity"
            label="City"
            maxLength={120}
            defaultValue={settings.addressCity}
          />
          <TextField
            name="addressRegion"
            label="Region"
            maxLength={120}
            defaultValue={settings.addressRegion}
          />
          <TextField
            name="addressPostalCode"
            label="Postal code"
            maxLength={30}
            defaultValue={settings.addressPostalCode}
          />
          <TextField
            name="addressCountry"
            label="Country"
            maxLength={120}
            defaultValue={settings.addressCountry}
          />
        </div>
      </fieldset>

      <fieldset className="border-line-300 space-y-4 rounded-md border p-6">
        <legend className="px-2 text-sm font-semibold">Social</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="socialInstagram"
            label="Instagram"
            defaultValue={settings.socialInstagram}
          />
          <TextField
            name="socialFacebook"
            label="Facebook"
            defaultValue={settings.socialFacebook}
          />
          <TextField name="socialX" label="X" defaultValue={settings.socialX} />
          <TextField name="socialYoutube" label="YouTube" defaultValue={settings.socialYoutube} />
        </div>
      </fieldset>

      <fieldset className="border-line-300 space-y-4 rounded-md border p-6">
        <legend className="px-2 text-sm font-semibold">Age gate</legend>
        <CheckboxField
          name="ageGateEnabled"
          label="Ask visitors to confirm their age before the site opens"
          defaultChecked={settings.ageGateEnabled}
        />
        <TextField
          name="ageGateMinimumAge"
          label="Minimum age"
          type="number"
          hint="Between 18 and 21."
          defaultValue={settings.ageGateMinimumAge}
        />
      </fieldset>

      <fieldset className="border-line-300 space-y-4 rounded-md border p-6">
        <legend className="px-2 text-sm font-semibold">Order confirmation</legend>
        <TextAreaField
          name="orderConfirmationNote"
          label="Note shown after an order request is submitted"
          rows={4}
          maxLength={2000}
          hint="Explain that the request is not a completed sale and that payment is arranged offline."
          defaultValue={settings.orderConfirmationNote}
        />
      </fieldset>
    </AdminForm>
  );
}
