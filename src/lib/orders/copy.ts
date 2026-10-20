/**
 * Customer-facing copy for the order-request step.
 *
 * Centralised so the wording cannot drift between the checkout form, the
 * confirmation and any error surface, and so the one thing that must never be
 * implied — that a payment has been taken — is written once and reviewed once.
 *
 * The rule for every string here: an order request is a *request*. It is not a
 * payment and not a confirmed sale. Submitting it does hold the piece — the
 * database reserves stock in the submission transaction — so the copy says that
 * plainly rather than implying the hold starts later; the team still confirms
 * availability and settles payment offline.
 */

export const ORDER_COPY = {
  /** The step is named for what it is, not for what it is not. */
  pageTitle: 'Order request',
  intro:
    'Tell us how you would like to receive the piece and how you would like to settle. This is a request, not a payment — an administrator will confirm availability with you before anything is agreed.',

  /** Shown wherever a customer might expect a card form. */
  noPaymentNotice:
    'No payment is taken on this website. There is no card form and nothing is charged now. We will contact you to arrange payment directly.',

  /** The confirmation, after a request is accepted. */
  successTitle: 'Your order request has been received',
  successBody:
    'Thank you. A member of the team will review your request, confirm availability and contact you at the email address you provided to arrange payment.',

  /** Why a reference and, for a guest, a link are given. */
  keepReference: 'Quote this reference if you contact us about this request.',

  termsLabel:
    'I have read and accept the terms of sale and the privacy notice, and I understand that sending this form does not take a payment.',
} as const;
