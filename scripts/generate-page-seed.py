import json, io, sys

def fig(path, caption=None):
    b = {"type": "figure", "src": path}
    if caption: b["caption"] = caption
    return b

def h(text, level=2): return {"type": "heading", "text": text, "level": level}
def p(text): return {"type": "paragraph", "text": text}
def ul(items): return {"type": "list", "items": items}
def ol(items): return {"type": "list", "items": items, "ordered": True}
def note(text, tone="info"): return {"type": "callout", "text": text, "tone": tone}

BENCH = "/site-photography/watchmaker-bench.webp"
CALIBRE = "/site-photography/omega-calibre-1861.webp"
PATEK = "/site-photography/patek-display.webp"
BOX = "/site-photography/watch-and-box.webp"
CASEBACK = "/site-photography/exhibition-caseback.webp"
VINTAGE = "/site-photography/collection-vintage-boxed.webp"
BUREN = "/site-photography/buren-movement.webp"
GOLD_POCKET = "/site-photography/gold-pocket-watch.webp"

PLATES = {
    BENCH: "A watchmaker\u2019s bench, tools laid out at the start of a service.",
    CALIBRE: "An exposed chronograph calibre \u2014 bridges, levers and a column wheel.",
    PATEK: "A display cabinet of Patek Philippe references.",
    BOX: "A wristwatch beside its presentation box.",
    CASEBACK: "An exhibition caseback, showing the automatic movement inside.",
    VINTAGE: "Vintage wristwatches shown with their presentation boxes.",
    GOLD_POCKET: "A gold pocket watch photographed against black.",
    BUREN: "A mechanical movement out of its case, photographed from above.",
}
# A caption must not claim the plate is our stock: these are editorial plates.
for k, v in PLATES.items():
    low = v.lower()
    for bad in ("our stock", "in stock", "for sale", "we sell"):
        assert bad not in low, (k, v)

ABOUT = [
    p("We are a specialist dealer in pre-owned luxury watches. We buy, sell, trade and service mechanical timepieces, and we have built this site around the way that work actually happens: a conversation, an inspection, and then an agreement."),
    p("That means we do not treat a storefront as a checkout. You will not find a basket that takes a card, because the piece you are looking at is usually one watch in one safe, and the honest thing to do is speak to somebody before money moves. What you will find is an accurate description of every piece, the condition written down plainly, and a person who answers."),
    fig(BENCH, PLATES[BENCH]),
    h("How we work"),
    p("Every watch follows the same path before it is listed. Nothing skips a step because it is rare, or because somebody is in a hurry to sell it."),
    ol([
        "The watch is examined by our watchmakers: case, dial, hands, movement and bracelet are each looked at on their own terms.",
        "Authenticity is established from the case, the movement and the paperwork where it survives \u2014 not from a box and a smile.",
        "Condition is recorded honestly, including refinishing, replacement parts and anything that does not belong to the reference.",
        "The piece is photographed and described, and the description is checked against the watch rather than the other way round.",
        "It is offered. If it sells, the listing comes down; a sold watch is never left up as a shop window.",
    ]),
    h("What we record, and why"),
    p("A pre-owned watch is a small history. Its value is not only in the reference number but in what has happened to it, so we write that history down and give it to you."),
    ul([
        "The reference, and any variation from it.",
        "The year of production where it can be established, and the reason we believe it.",
        "Whether the box, the papers, both or neither are present.",
        "Any service history we can verify, and by whom the work was done.",
        "Anything replaced \u2014 a bezel insert, a crystal, a bracelet \u2014 and whether the original survives.",
        "Measurements taken from the watch itself, not copied from a catalogue.",
    ]),
    fig(CALIBRE, PLATES[CALIBRE]),
    h("What we look for"),
    p("We look for watches with an honest history and, where it survives, complete documentation. A piece that has been worn is not a lesser piece; a piece that has been misrepresented is. We would rather sell you a watch with a service history and a scuff than a polished one with a story."),
    ul([
        "An original dial, hands and bezel unless we say otherwise, in writing.",
        "A movement that keeps time within the tolerances we quote for that calibre.",
        "A case that has not been over-polished, with lugs and bevels that still have their shape.",
        "Paperwork that matches the watch in front of us \u2014 reference, serial and date.",
        "A price that reflects the watch in front of us, not the one in the photograph.",
    ]),
    h("Buying from us"),
    p("You submit an order request; we confirm availability in writing and arrange payment directly with the boutique. No payment is taken on this website, at any point, by any method."),
    ul([
        "Adding a piece to your cart or wishlist does not reserve it. A piece is reserved only when we confirm it in writing.",
        "Because most of our stock is a single piece, a watch can sell while it sits in your cart. We re-check availability when you submit a request.",
        "We will tell you if a piece is not right for what you have described, even when that costs us the sale.",
        "Everything is delivered fully insured, signature required and tracked.",
    ]),
    fig(PATEK, PLATES[PATEK]),
    h("Selling and trading"),
    p("We buy outright, and we take trades against stock. Send us the brand, model, reference, condition and any paperwork, with photographs if you have them, and we will come back with a valuation and the reasoning behind it."),
    ul([
        "Nothing is agreed until you accept the valuation.",
        "We will tell you when a watch is worth more sold privately than traded, even though a trade is easier for us.",
        "If a piece needs work before it can be sold, we will say so and show you the estimate.",
        "We do not value a watch we have not seen, beyond a range.",
    ]),
    h("Servicing and restoration"),
    p("Our watchmakers service watches we sold and watches we did not. A service begins with an inspection and an estimate; no work starts until you have agreed it. Where a part cannot be sourced, we will tell you what that means for the watch rather than substituting something that fits but does not belong."),
    fig(CASEBACK, PLATES[CASEBACK]),
    h("Where we stand"),
    p("We are an independent dealer. We are not an authorised dealer for any of the brands we sell, we have no affiliation with the manufacturers, and we do not claim otherwise. The brand names on this site identify the watches; they do not imply a relationship."),
    note("We are an independent dealer. We are not an authorised dealer for any of the brands we sell, and we do not claim to be.", "info"),
    h("Talk to us"),
    p("If you are looking for a particular reference, ask. A good part of what we do is finding a watch for somebody who has been looking for one for a while, and a conversation is a better start than a search box."),
]

FAQ_INTRO = [
    p("The questions below are the ones we are asked most often, grouped by what they are about. If yours is not here, contact us and we will answer it directly \u2014 by email or on the telephone, whichever suits you."),
    p("Nothing on this page is a substitute for the full policies. Where a question touches money, delivery or returns, the detailed policy governs, and it is linked from the footer of every page."),
    fig(BUREN, PLATES[BUREN]),
]

TERMS = [
    p("These terms apply to your use of this website and to any sale we agree with you. Please read them before you submit an order request. If you do not agree with them, please do not use the site."),
    note("This website does not take payment. Nothing on it is an offer capable of acceptance. An order request is an invitation to treat, and a contract is formed only when we confirm your order in writing and payment is settled.", "info"),
    h("Who these terms are between"),
    p("These terms are between you and the business that operates this website. Our business name, trading details and contact information are shown in the footer of every page and are repeated in the confirmation we send you. References to \u201cwe\u201d, \u201cus\u201d and \u201cour\u201d mean that business; \u201cyou\u201d means the person using the site, whether as a visitor, an account holder or a customer."),
    h("Using this website"),
    p("You may use this website for your own personal, non-commercial purposes and for legitimate enquiries about our stock. You are responsible for the equipment and the connection you use to reach it."),
    p("We try to keep the site available, accurate and secure, but we do not promise that it will be uninterrupted or free of errors. Maintenance, a supplier outage or a fault can take it down, and we may change or withdraw any part of it without notice."),
    h("Our content and intellectual property"),
    p("The text, design, layout and code of this website belong to us. The brand names, model names and reference numbers are the trade marks of their owners and are used to identify the watches we offer; their use does not imply any affiliation with, or endorsement by, the manufacturers."),
    p("Editorial photographs on this site are licensed from their authors and are credited where they appear. Photographs of individual watches for sale are ours. You may not copy, republish or use either for a commercial purpose without permission."),
    h("What you must not do"),
    ul([
        "Use the site for anything unlawful, or to infringe anybody else\u2019s rights.",
        "Attempt to gain access to any part of the site or its data that is not intended for you.",
        "Introduce malicious code, or interfere with the site\u2019s normal operation.",
        "Scrape, harvest or systematically copy listings, prices or contact details.",
        "Misrepresent yourself as another person, or as acting for us.",
        "Submit an order request you do not intend to honour, or a false enquiry.",
    ]),
    h("Product information and accuracy"),
    p("We describe every watch in good faith and in detail, including its condition and anything that has been replaced. Even so, a written description cannot capture everything a trained eye sees in the metal. Measurements are approximate. Colours vary between screens, and a photograph is not the watch."),
    p("Where a description and the watch disagree, the watch as inspected governs, and we will put it right. That is a promise rather than a limitation of liability, and it sits alongside your statutory rights."),
    note("Photographs on the catalogue pages show the actual piece offered. Editorial photographs elsewhere on the site are illustrative and are not photographs of stock for sale.", "info"),
    h("Prices and availability"),
    p("Prices are shown in the currency indicated and are confirmed at the time of your order request. Pre-owned stock is not reproducible: most references exist here as a single piece. A price or a listing can therefore change, or the piece can sell, between your request and our confirmation."),
    p("Where a price is shown as an enquiry, we have not published a figure \u2014 usually because the piece is being appraised or is offered by arrangement. An enquiry is not a quote until we send you one in writing."),
    fig(BOX, PLATES[BOX]),
    h("Order requests and when a contract is formed"),
    ol([
        "You submit an order request through the site. This is an invitation to treat, not an offer.",
        "We check the watch is still available and confirm the price, delivery and any condition notes in writing.",
        "You accept that confirmation and arrange payment with us directly.",
        "A contract is formed only when we have confirmed your order in writing and payment has been settled.",
    ]),
    p("Adding a piece to a cart or a wishlist does not reserve it, and we may decline an order request \u2014 for example where a piece has already sold, where we cannot verify the details, or where we are not able to deliver to your address."),
    h("Payment"),
    p("This website does not take payment, hold card details or process card transactions. Payment is arranged directly with the boutique and is settled before dispatch unless we have agreed otherwise in writing. We will never ask you for card details by email or in a message."),
    h("Delivery and risk"),
    p("Delivery is described in full in our shipping policy. Every piece is sent fully insured, signature required and tracked. Risk passes to you when the piece is delivered to the address on the order; ownership passes when payment is settled in full."),
    h("Returns and refunds"),
    p("Our returns window, the condition a returned watch must be in, and how a refund is made are set out in our returns and warranty policy. Nothing in these terms reduces the rights you have as a consumer under the law that applies to you."),
    h("Our liability to you"),
    p("We do not exclude or limit our liability for death or personal injury caused by our negligence, for fraud, or for anything else the law does not allow us to exclude. Nothing in these terms is intended to do so."),
    p("Subject to that, we are responsible for loss you suffer that is a foreseeable result of our breaking these terms or failing to use reasonable care. We are not responsible for loss that was not foreseeable, for loss of profit or business, or for a loss caused by something outside our control."),
    p("If a watch we supply is not as described, our obligation is to put it right \u2014 by repair, replacement or refund \u2014 and that is the extent of what we owe for that failure."),
    h("Links to other sites"),
    p("Where we link to another website, we do so because we think it is useful. We do not control it and we are not responsible for its content, its accuracy or how it handles your data. Following a link is your decision."),
    h("Governing law and disputes"),
    p("These terms are governed by the law of the country in which our business is established and registered \u2014 the country shown with our contact details. Disputes may be brought in the courts of that country."),
    p("If you are a consumer living elsewhere, this does not deprive you of the protection of the mandatory consumer law of the country you live in, and you may also be able to bring a claim in your local courts. Before either of us goes to court, please talk to us: almost every dispute we have seen is a misunderstanding that a conversation resolves."),
    h("Changes to these terms"),
    p("We may update these terms to reflect a change in the law, in our services or in how the site works. The version that applies to a sale is the one published when your contract was formed. The date this page was last reviewed is recorded on the page itself."),
    h("Contact"),
    p("Questions about these terms, an order, or a piece of stock are welcome, and should go to the contact details in the footer. If you are writing about an existing order, quote the reference we gave you and we will find it immediately."),
]

PRIVACY = [
    p("This policy explains what personal data we hold, why we hold it, who else sees it and what you can ask us to do with it. It describes what this website actually does \u2014 not a generic template \u2014 including the one cookie the site sets and the services it runs on."),
    h("Who we are"),
    p("We are the business that operates this website. For the purposes of data protection law we are the controller of the personal data described here: we decide why it is held and how it is used. Our contact details are in the footer of every page."),
    h("What we hold"),
    p("We hold only what we need to answer an enquiry, fulfil an order and keep our own records straight. In practice that is:"),
    ul([
        "The details you give us when you enquire, request an order or create an account: your name, email address, telephone number and, where you give it, a postal address.",
        "The contents of your enquiry, order request or service request, and our correspondence about it.",
        "Your order and service history, so that we can answer a question about a watch months or years later.",
        "If you create an account, your sign-in identity and any watch you save to a wishlist.",
        "If you subscribe, your email address and the fact that you asked to be contacted.",
        "Basic technical information needed to keep the site working and secure \u2014 for example server logs recording that a page was requested, and error records. These are not used to build a profile of you.",
    ]),
    note("We do not run advertising or analytics trackers on this site. There is no third-party analytics script, no advertising pixel and no cross-site tracking of any kind on these pages.", "info"),
    h("What we do not hold"),
    p("We do not take payment on this website, so we never receive, see or store your card number, security code or bank credentials. Payment is arranged directly with the boutique. If somebody claiming to be us asks you for card details by email or message, it is not us \u2014 tell us immediately."),
    h("Cookies and the guest cart"),
    p("This site sets one cookie of its own, called lw_cart_session. It holds a random identifier so that a guest can keep a cart together before signing in. It is set httpOnly \u2014 which means scripts on the page cannot read it \u2014 and it is not used to identify you to anybody else or to track you across other sites."),
    p("Beyond that the site uses no advertising cookie and no analytics cookie. When you sign in, the authentication session is held in a cookie by our authentication provider so that you stay signed in; it is strictly necessary for the account area to work. You can clear these cookies in your browser at any time, which will empty a guest cart and sign you out."),
    h("Why we hold it, and our lawful basis"),
    ul([
        "To answer your enquiry and fulfil your order \u2014 because we need it to perform the contract we have with you, or to take steps at your request before one is formed.",
        "To keep records of sales and service work \u2014 because we have a legitimate interest in being able to answer a question about a watch later, and a legal obligation to keep some records.",
        "To keep the site secure and working \u2014 because we have a legitimate interest in preventing abuse and diagnosing faults.",
        "To send you a newsletter or an update \u2014 only with your consent, which you can withdraw at any time using the unsubscribe link in the message.",
    ]),
    fig(CASEBACK, PLATES[CASEBACK]),
    h("Who else sees it"),
    p("We do not sell your data, and we do not share it for anybody else\u2019s marketing. It is handled by a small number of service providers who process it on our behalf, under contract, for the purposes above:"),
    ul([
        "Our database, authentication and file-storage provider, which hosts the data and the account system.",
        "Our email provider, which delivers the messages we send you about an enquiry, an order or a service request.",
        "Our hosting provider, which serves the website and keeps the technical logs described above.",
        "Professional advisers, and a carrier or insurer, where that is necessary to complete a delivery or resolve a claim.",
    ]),
    p("We will also disclose data where the law requires it, or to establish or defend a legal claim."),
    h("Where it is held"),
    p("Our providers operate internationally, so your data may be stored or processed outside the country you live in. Where that happens, we rely on the safeguards those providers offer for international transfers, such as the standard contractual clauses approved for the purpose. You can ask us for more detail about the transfer mechanism that applies to your data."),
    h("How long we keep it"),
    ul([
        "Enquiries that do not become an order: up to 24 months, so that we can pick up a conversation where it left off.",
        "Order and service records: for as long as we may need to answer a question or honour a warranty, and for the period accounting and tax law requires. In practice that is up to six years after the sale.",
        "Newsletter subscriptions: until you unsubscribe.",
        "Account data: until you ask us to close the account.",
        "Server and error logs: a short period, kept only long enough to diagnose a fault or investigate abuse.",
    ]),
    p("When a retention period ends we delete the data or make it anonymous, so that it can no longer be linked to you."),
    h("Your rights"),
    p("You have the right to ask for a copy of the personal data we hold about you, to have it corrected if it is wrong, and in some circumstances to have it deleted or its use restricted. You can object to processing we do on the basis of our legitimate interests, and you can withdraw consent for anything we do only with your consent."),
    p("Ask us and we will respond within the period the law allows. We will not charge for a reasonable request. If we cannot do what you have asked \u2014 for example because we must keep a record for tax purposes \u2014 we will tell you why."),
    p("If you are not satisfied with how we have handled your data, please tell us first: most concerns are solved by a conversation. You also have the right to complain to the data protection authority in the country where you live or work."),
    h("Keeping it safe"),
    p("Access to customer data is restricted to the people who need it to do their work, and access to the database is scoped by row-level security so that a customer can reach their own records and nobody else\u2019s. Data is held with providers who encrypt it in transit and at rest. Messages about an order are sent to you and, where a delivery requires it, to the person handling it \u2014 never broadcast."),
    p("If a breach ever affected your data in a way that puts your rights at risk, we would tell you and the relevant authority without undue delay, as the law requires."),
    h("Children"),
    p("This site is not directed at children, and we do not knowingly hold personal data about anyone under 18. If you believe a child has given us data, tell us and we will delete it."),
    h("Changes to this policy"),
    p("We update this policy when the site or the law changes what we do with data. The date this page was last reviewed is recorded on the page. If a change materially affects what we do with data you have already given us, we will tell you rather than expect you to notice."),
]

SHIPPING = [
    p("Every timepiece is sent fully insured, signature required, and tracked door to door. This page sets out how we send, what you should expect when the parcel arrives, and what to do if something goes wrong."),
    fig(BOX, PLATES[BOX]),
    h("How we send"),
    ul([
        "Fully insured for the full value of the piece, for the whole journey.",
        "Signature required on delivery, taken from an adult at the delivery address.",
        "Tracked door to door, with the tracking reference sent to you when the parcel leaves us.",
        "Discreet outer packaging that does not name the contents, the brand or the value.",
        "The watch packed so that it cannot move inside its box, with the bracelet supported.",
    ]),
    h("When we dispatch"),
    p("Most pieces are dispatched within two working days of payment being settled. A watch that needs a final regulation, a new strap or a service before it travels takes longer, and we will tell you the day it will leave rather than let you guess."),
    p("Dispatch is a working-day promise. Orders settled late on a Friday, or on a day when the carrier does not collect, leave on the next working day. Once a parcel is with the carrier the delivery estimate is theirs, and we will chase it on your behalf if it slips."),
    h("Where we deliver"),
    p("We deliver to most countries. If we cannot ship to yours \u2014 because of a carrier restriction, an insurance exclusion or an import rule \u2014 we will tell you before you pay, not after."),
    p("We can send to your home, your workplace, or a carrier collection point where the carrier offers one. We do not send a high-value parcel to an unattended address, and we will ask you to confirm the delivery address before dispatch."),
    h("Customs and duties"),
    p("For a delivery outside the country we ship from, import duties, taxes and any customs handling charge are set by the destination country and are payable by you. They are not included in the price of the watch, and we cannot tell you in advance exactly what they will be, because the rate depends on how the parcel is classified on the day."),
    p("If a parcel is held or returned because a charge was not paid, we will contact you. A watch returned to us by customs is refunded under our returns policy, less any cost we cannot recover."),
    h("If the parcel arrives damaged"),
    p("Inspect the parcel before you sign where you can. If the outer packaging is damaged, say so to the carrier and photograph it before opening it. Then tell us within 24 hours, with photographs of the packaging and the watch, and we will deal with the carrier and the insurer on your behalf."),
    p("Keep the packaging until the piece is confirmed in good order. An insurer will ask for it, and a claim is harder without it."),
    h("If a parcel is lost"),
    p("Every parcel is tracked and insured, so a parcel that stops moving is our problem, not yours. Tell us as soon as the tracking stops making sense and we will open a claim with the carrier. We will keep you informed, and we will not make you wait for the carrier\u2019s process before we tell you where things stand."),
    h("Collecting in person"),
    p("If you would rather collect, tell us when you enquire and we will arrange it. Bring photographic identification in the name on the order. A watch will not be released to somebody else without your written instruction, and we may ask for that instruction to be confirmed by a call to the number we hold."),
    note("Please inspect the parcel before signing where you can, and tell us within 24 hours if anything is wrong with it.", "warning"),
]

WARRANTY = [
    p("If a watch is not as we described it, tell us and we will put it right. This page sets out our returns window, how a refund works and what our warranty covers. It sits alongside your statutory rights, which it does not replace."),
    fig(VINTAGE, PLATES[VINTAGE]),
    h("Returns"),
    p("You may return a watch within 14 days of receiving it. That window is there because a photograph and a description, however careful, are not the same as the watch in your hand."),
    ol([
        "Tell us within 14 days of delivery that you wish to return it, by email or telephone. A message is enough; you do not need to have decided why.",
        "Send it back in the condition it was sent, with everything that came with it \u2014 box, papers, tags, spare links and any tool we supplied.",
        "Insure the parcel for its full value and use a signature service. It remains your responsibility until it reaches us.",
        "We refund the purchase price once the watch has been inspected on return.",
    ]),
    h("What affects a refund"),
    p("We refund in full where a watch comes back as we sent it. Where a watch has been worn in a way that has diminished its value \u2014 a scratched case, a bracelet resized and not resized back, a strap cut to fit \u2014 we may make a deduction that reflects the loss. We will tell you the figure and how we reached it before we make it, and you can disagree."),
    p("We do not make a deduction for handling a watch as you would in a shop: trying it on, winding it, looking at it in daylight."),
    h("How and when we refund"),
    p("We refund to the account the payment came from, once the watch has been inspected. In practice that is within five working days of the watch reaching us and passing inspection. If a refund takes longer, it is because we are waiting for a payment to clear or for a question to be answered, and we will tell you which."),
    fig(GOLD_POCKET, PLATES[GOLD_POCKET]),
    h("Our warranty"),
    p("Our warranty covers the movement for 12 months from the date of purchase. If the movement stops, or does not keep time within the tolerances we quoted for it, we will repair it \u2014 or have it repaired by our watchmakers \u2014 at no cost to you."),
    ul([
        "It covers the movement and its timekeeping.",
        "It does not cover accidental damage, a knock, a drop or a scratch.",
        "It does not cover water ingress after purchase, including water damage after a seal has aged.",
        "It does not cover normal wear: a strap, a gasket, or a crystal that has picked up marks.",
        "Work carried out by a third party voids it, because we cannot vouch for what was done.",
    ]),
    h("If a fault appears after 30 days"),
    p("A fault in the first 30 days is treated as a fault present at the point of sale: tell us and we will repair, replace or refund. After 30 days we will repair under the warranty. If a repair is not possible, we will discuss a replacement or a refund with you."),
    h("Your statutory rights"),
    p("Our returns window and warranty are in addition to your rights under consumer law, which may be stronger than this policy \u2014 for example a right to a remedy where goods are not as described, not fit for purpose or not of satisfactory quality. Nothing in this policy reduces those rights, and where the two differ, your statutory rights prevail."),
    note("This is a summary of our policy, not a substitute for your statutory rights. If you think a watch is not as we described it, contact us before doing anything else \u2014 we would rather solve it directly.", "info"),
    h("Returning a watch you collected"),
    p("The same window applies to a watch collected from us as to one sent by carrier, counted from the day you collect it. Bring it back to us, or send it as above."),
    h("Contact"),
    p("To start a return, or to ask a question about a warranty claim, use the contact details in the footer and quote the reference we gave you. If you are sending a watch back, tell us first so we can expect it and insure the return leg correctly."),
]

PAGES = [
    ("00000000-0000-4000-8000-000000000401", "about", "About Us",
     "Who we are, how we work, and what we look for in a watch.",
     ABOUT, "published",
     "About Us | An independent dealer in pre-owned luxury watches",
     "We buy, sell, trade and service pre-owned luxury watches. Every piece is examined and authenticated by our watchmakers, and its condition is described honestly.",
     False),
    ("00000000-0000-4000-8000-000000000402", "shipping", "Shipping",
     "How we deliver, insure and track a timepiece, and what to expect when it arrives.",
     SHIPPING, "published",
     "Shipping and delivery | Insured, tracked, signature required",
     "How we send a watch: fully insured, signature required and tracked door to door, with dispatch times, customs, and what to do if a parcel arrives damaged or goes missing.",
     False),
    ("00000000-0000-4000-8000-000000000403", "warranty", "Returns, Refunds & Warranty",
     "Our returns window, how a refund works, and what our warranty covers.",
     WARRANTY, "published",
     "Returns, refunds and warranty",
     "Our 14-day returns window, how and when we refund, and the 12-month movement warranty \u2014 alongside the consumer rights that sit above them.",
     False),
    ("00000000-0000-4000-8000-000000000404", "terms", "Terms of Use",
     "The terms on which this site and our sales operate.",
     TERMS, "published",
     "Terms of Use",
     "The terms that apply to this website and to a sale: how a contract is formed, how prices and availability work, delivery and risk, liability, and the law that governs them.",
     False),
    ("00000000-0000-4000-8000-000000000405", "privacy", "Privacy Policy",
     "What personal data we hold, why we hold it and how you can ask us to remove it.",
     PRIVACY, "published",
     "Privacy Policy",
     "What personal data we hold and why, the single cookie this site sets, the providers that process data on our behalf, how long we keep it, and the rights you can exercise.",
     True),
    ("00000000-0000-4000-8000-000000000406", "faq", "Frequently Asked Questions",
     "Answers on buying, selling, authentication, payment, shipping, returns and servicing.",
     FAQ_INTRO, "published",
     "Frequently Asked Questions",
     "Answers on authenticating a watch, buying without online payment, shipping and insurance, returns and warranty, servicing, selling or trading, and finding a specific reference.",
     False),
]

FAQS = [
    ("00000000-0000-4000-8000-000000000451", "Are your watches authentic?",
     "Every watch is examined and authenticated by our watchmakers before it is offered, and we describe condition honestly, including any refinishing or replacement parts.\n\nWe check the case, the movement and the paperwork against the reference \u2014 not just a box and a serial. If a piece is not as we described it, tell us and we will put it right.",
     "Authentication", 10, True),
    ("00000000-0000-4000-8000-000000000452", "How do you authenticate a watch?",
     "The examination is of the watch itself. We look at the case shape and its finish, the dial, hands and bezel against what that reference should have, and the movement for the correct calibre, finishing and stampings. Where paperwork survives, we match the reference, serial and date to the watch in front of us.\n\nAnything that does not belong \u2014 a later bezel insert, a replacement crystal, a dial that has been refinished \u2014 is recorded and disclosed in the listing. We would rather lose a sale than describe a watch as something it is not.",
     "Authentication", 20, True),
    ("00000000-0000-4000-8000-000000000453", "Does the watch come with its box and papers?",
     "Where it does, the listing says so, and the photographs show what is actually included. Where it does not, the listing says that too. \u201cPapers\u201d means the original warranty card or certificate where we have it; a service receipt is listed as service history, not as papers.\n\nIf the presence of the box or the papers matters to you, ask before you order and we will confirm it in writing.",
     "Authentication", 30, True),
    ("00000000-0000-4000-8000-000000000454", "Can I see the watch before I buy?",
     "Yes, where the piece is with us. Ask when you enquire and we will arrange a viewing, or send additional photographs and a video of the actual watch \u2014 the dial under different light, the case sides, the bracelet and the caseback.\n\nWhat you see is the piece you get. We do not use a stock photograph to stand in for a watch we have in hand.",
     "Authentication", 40, True),
    ("00000000-0000-4000-8000-000000000455", "Can I pay online?",
     "No. This website does not take payment. You submit an order request and a member of the team contacts you to arrange payment directly with the boutique.\n\nYour order is not confirmed until we have confirmed it in writing and payment has been settled. Payment is settled before dispatch unless we agree otherwise with you in writing.",
     "Payment", 10, True),
    ("00000000-0000-4000-8000-000000000456", "How do I pay?",
     "Once we have confirmed the piece and the price in writing, we will arrange payment with you directly \u2014 by bank transfer, or by another method we agree in writing. We will send you the details from an address you can verify, and we are happy to confirm them by telephone before you send anything.\n\nWe never ask for card details by email or message. If a message claims to be us and asks for them, it is not us \u2014 tell us immediately.",
     "Payment", 20, True),
    ("00000000-0000-4000-8000-000000000457", "Do you take a deposit to hold a watch?",
     "Sometimes, by agreement. A deposit is a separate arrangement we make in writing, and we will tell you at the time whether it is refundable and on what terms.\n\nAdding a piece to your cart or wishlist is not a deposit and does not hold the watch. A piece is reserved only when we confirm it in writing.",
     "Payment", 30, True),
    ("00000000-0000-4000-8000-000000000458", "Does adding a watch to my cart reserve it?",
     "No. A cart or wishlist is a list of pieces you are interested in. A piece is not reserved until we confirm it in writing.\n\nBecause most of our stock is a single piece, a watch can sell while it is in your cart. We re-check availability when you load your cart and when you submit an order request, and we will tell you plainly if it has gone.",
     "Buying", 10, True),
    ("00000000-0000-4000-8000-000000000459", "How quickly will you reply to my enquiry?",
     "We aim to reply within one working day. If you have asked about a specific piece, include the reference number if you have it and we will answer more precisely.\n\nAn enquiry about a watch that is already with us usually gets a same-day answer with photographs.",
     "Buying", 20, True),
    ("00000000-0000-4000-8000-000000000460", "What does \u201cenquiry only\u201d mean on a listing?",
     "It means we have not published a price \u2014 usually because the piece is being appraised, is offered by arrangement, or its price moves with the market. You can still enquire, and we will come back with a figure in writing.\n\nAn enquiry is not a quote until we have sent you one, and we will always tell you why a price is by arrangement rather than dress it up.",
     "Buying", 30, True),
    ("00000000-0000-4000-8000-000000000461", "How do you describe condition?",
     "Plainly, and in the listing rather than only on request. We state whether the case has been polished, whether the dial or hands have been replaced or refinished, whether the bracelet has stretch, and anything else a buyer would want to know before seeing the watch.\n\nWe do not use a made-up grade that hides the detail, and we do not call a watch \u201cmint\u201d to mean \u201cworn but polished\u201d.",
     "Buying", 40, True),
    ("00000000-0000-4000-8000-000000000462", "How do you deliver a watch?",
     "Every timepiece is sent fully insured, signature required and tracked door to door, in discreet packaging that does not name the contents.\n\nMost pieces are dispatched within two working days of payment being settled. We will send you the tracking reference when the parcel leaves us.",
     "Shipping", 10, True),
    ("00000000-0000-4000-8000-000000000463", "Do you ship internationally?",
     "We deliver to most countries. If we cannot ship to yours \u2014 because of a carrier restriction, an insurance exclusion or an import rule \u2014 we will tell you before you pay.\n\nImport duties, taxes and customs handling charges are set by the destination country and are payable by you. They are not included in the price of the watch.",
     "Shipping", 20, True),
    ("00000000-0000-4000-8000-000000000464", "Is the parcel insured, and what if it goes missing?",
     "Every parcel is insured for its full value for the whole journey, and tracked door to door. If it is lost or damaged in transit, that is our problem rather than yours: tell us as soon as the tracking stops making sense and we will open a claim with the carrier and keep you informed.\n\nIf a parcel arrives damaged, say so to the carrier where you can, photograph the packaging before opening it, and tell us within 24 hours.",
     "Shipping", 30, True),
    ("00000000-0000-4000-8000-000000000465", "Can I collect a watch in person?",
     "Yes, where the piece is with us. Tell us when you enquire and we will arrange it. Bring photographic identification in the name on the order.\n\nA watch will not be released to somebody else without your written instruction, and we may confirm that instruction with a call to the number we hold.",
     "Shipping", 40, True),
    ("00000000-0000-4000-8000-000000000466", "Can I return a watch?",
     "Yes. Tell us within 14 days of receiving the watch if you wish to return it. It must come back in the condition it was sent, with everything that accompanied it, and we refund the purchase price once it has been inspected on return.\n\nInsure the parcel for its full value and use a signature service. Nothing in our returns policy reduces your statutory rights.",
     "Returns", 10, True),
    ("00000000-0000-4000-8000-000000000467", "When will I get my refund?",
     "We refund to the account the payment came from, once the watch has been inspected. In practice that is within five working days of the watch reaching us and passing inspection.\n\nWhere a watch has been worn in a way that has diminished its value \u2014 a scratched case, a strap cut to fit \u2014 we may make a deduction. We will tell you the figure and how we reached it before we make it, and you can disagree.",
     "Returns", 20, True),
    ("00000000-0000-4000-8000-000000000468", "What does your warranty cover?",
     "Our warranty covers the movement for 12 months from the date of purchase. It does not cover accidental damage, water ingress after purchase or normal wear, and work carried out by a third party voids it.\n\nA fault in the first 30 days is treated as a fault present at the point of sale: tell us and we will repair, replace or refund.",
     "Returns", 30, True),
    ("00000000-0000-4000-8000-000000000469", "What happens if a fault appears after the warranty ends?",
     "Tell us anyway. We service watches we sold long after the warranty has ended, and we would rather look at it than have you take it somewhere that will not know the watch.\n\nA repair after the warranty is a normal service: we inspect, estimate, and only start once you have agreed the figure.",
     "Servicing", 10, True),
    ("00000000-0000-4000-8000-000000000470", "Do you service watches you did not sell?",
     "Yes. Send us the details through the repair and restoration page and a watchmaker will inspect the watch and send you an estimate before any work begins.\n\nWhere a part cannot be sourced, we will tell you what that means for the watch rather than substituting something that fits but does not belong.",
     "Servicing", 20, True),
    ("00000000-0000-4000-8000-000000000471", "How often should a mechanical watch be serviced?",
     "Most modern movements are serviced every five to seven years, and a watch that is worn daily is usually the one that needs it first. A vintage piece is different: the right interval depends on the movement, and doing more than the watch needs can be as unkind as doing too little.\n\nIf a watch is losing or gaining time, or the crown feels rough, that is the moment to have it looked at rather than waiting for a date on a calendar.",
     "Servicing", 30, True),
    ("00000000-0000-4000-8000-000000000472", "Will you buy my watch, or take it in part exchange?",
     "We buy pre-owned luxury watches outright and take trades against pieces in our stock. Send us the brand, model, reference and condition through the sell or trade page and we will come back with a valuation.\n\nNothing is agreed until you accept the valuation, and we will tell you if the watch is worth more sold privately than traded.",
     "Selling", 10, True),
    ("00000000-0000-4000-8000-000000000473", "How do you value a watch you buy?",
     "From the watch, not from a price list. We look at the reference and its current market, the condition and originality, what paperwork survives, and what work it needs before it can be sold. We will show you the reasoning behind the figure.\n\nWe do not value a watch we have not seen beyond a range, because a range is not a valuation and pretending otherwise wastes your time.",
     "Selling", 20, True),
    ("00000000-0000-4000-8000-000000000474", "Can you find a specific watch for me?",
     "Often, yes. Tell us the reference and the details that matter to you through the watch sourcing page and we will search our stock and our trade network.\n\nIf we find a piece, we send you the details and photographs. Nothing is ordered until you agree.",
     "Selling", 30, True),
    ("00000000-0000-4000-8000-000000000475", "Do I need an account to buy?",
     "No. You can enquire, request an order and track it without an account by using the reference we send you.\n\nAn account keeps your wishlist, your order history and your details in one place, which is worth having if you buy more than once. You can close it whenever you like and ask us to delete the data we are not required to keep.",
     "Account", 10, True),
    ("00000000-0000-4000-8000-000000000476", "What is the wishlist for?",
     "The wishlist is a private list of pieces you want to come back to. It does not reserve a watch and it does not share what you have saved with anybody else.\n\nA guest wishlist stays on the device it was made on. Sign in and it follows your account.",
     "Account", 20, True),
]

# Every FAQ answer keeps its paragraphs; the accordion renders `whitespace-pre-line`.
for fid, q, a, *_ in FAQS:
    assert "\n\n" in a, (q, "answer should use paragraph breaks")
# The registry is the gate for figures, so every path used must exist in it.
import re
registry = open("src/lib/images/site-photography.ts").read()
for blocks in (ABOUT, SHIPPING, WARRANTY):
    for b in blocks:
        if b["type"] == "figure":
            assert f"src: '{b['src']}'" in registry, b["src"]

def sql_json(blocks):
    return json.dumps(blocks, ensure_ascii=False, indent=6)

def esc(s):
    return s.replace("'", "''")

out = io.StringIO()
out.write("""-- =============================================================================
-- DEVELOPMENT CONTENT SEED  \u2014  DO NOT RUN AGAINST PRODUCTION
-- =============================================================================
--
-- Seeds the CMS pages and FAQs that Phase 11 renders from the database.
--
-- -----------------------------------------------------------------------------
-- IDEMPOTENCY
-- -----------------------------------------------------------------------------
--
-- Every row uses a fixed UUID and `on conflict (slug) do update`, so re-running
-- this file updates the seeded rows in place rather than deleting rows an
-- administrator created. The `0\u202604xx` prefix keeps the seeded ids recognisable.
--
-- -----------------------------------------------------------------------------
-- THE CONTENT IS OURS
-- -----------------------------------------------------------------------------
--
-- The prose below is written for this store. It is not copied from the reference
-- site, and it makes no claim of authorised-dealer status. It is deliberately
-- plain about the fact that this site takes no payment online: every policy that
-- touches money says the same thing the rest of the site does.
--
-- -----------------------------------------------------------------------------
-- THE FIGURES ARE REGISTRY PATHS, NOT URLS
-- -----------------------------------------------------------------------------
--
-- A `figure` block stores a path into `src/lib/images/site-photography.ts` and
-- nothing else. The alt text, the photographer, the licence and the dimensions
-- come from the registry entry, so a figure cannot put an uncredited photograph
-- on a page: a path the registry does not know renders nothing at all. That is
-- also why no caption below claims the photograph shows our stock \u2014 these
-- editorial plates illustrate the trade, and a stock claim would misdescribe it.
--
-- -----------------------------------------------------------------------------
-- WHAT AN OWNER MUST CONFIRM BEFORE LAUNCH
-- -----------------------------------------------------------------------------
--
-- Two things here are policy decisions rather than code, and the owner must
-- confirm them: the retention periods in the privacy policy, and the governing
-- law in the terms \u2014 which deliberately is not named, because naming one would
-- invent a jurisdiction the business may not trade in. Both are recorded in
-- KNOWN_ISSUES rather than quietly assumed here.
--
-- `status = 'published'` with a `published_at` because the table constrains a
-- published row to carry a timestamp. The content is stored as structured blocks
-- (see `src/lib/content/types.ts`), not HTML, so the renderer decides which
-- elements are emitted.
--
-- -----------------------------------------------------------------------------
-- `$json$` RATHER THAN '...'::jsonb
-- -----------------------------------------------------------------------------
--
-- The prose is full of apostrophes. Dollar-quoting the jsonb literal means the
-- content does not have to be escaped by hand, which is where a policy page gets
-- silently mangled.

-- -----------------------------------------------------------------------------
-- pages
-- -----------------------------------------------------------------------------
--
-- Upserted on `slug`, not `id`, because migration 0006 already created draft
-- system pages at two of these slugs (`shipping`, `warranty`). Keying on the slug
-- updates those rows in place and keeps the app route and the row in step, which
-- keying on `id` would not: it would collide on the unique slug index instead.
--
-- The slugs are the ones the footer links to (`/pages/about`, `/pages/faq`,
-- `/pages/privacy`, `/pages/terms`, `/pages/shipping`, `/pages/warranty`), which
-- are the routes this phase builds. The `warranty` slug now carries the whole
-- returns, refunds and warranty policy \u2014 the route and the footer label are
-- unchanged, so an existing link keeps working.
insert into public.pages (id, slug, title, excerpt, content, status, published_at, seo_title, seo_description, is_system)
values
""")

rows = []
for (pid, slug, title, excerpt, blocks, status, seo_title, seo_desc, is_system) in PAGES:
    rows.append(
        "  (\n"
        f"    '{pid}',\n"
        f"    '{slug}',\n"
        f"    '{esc(title)}',\n"
        f"    '{esc(excerpt)}',\n"
        f"    $json${sql_json(blocks)}$json$::jsonb,\n"
        f"    '{status}',\n"
        "    now(),\n"
        f"    '{esc(seo_title)}',\n"
        f"    '{esc(seo_desc)}',\n"
        f"    {'true' if is_system else 'false'}\n"
        "  )"
    )
out.write(",\n".join(rows))
out.write("""
on conflict (slug) do update
  set title           = excluded.title,
      excerpt         = excluded.excerpt,
      content         = excluded.content,
      status          = excluded.status,
      published_at    = excluded.published_at,
      seo_title       = excluded.seo_title,
      seo_description = excluded.seo_description,
      is_system       = excluded.is_system,
      updated_at      = now();

-- -----------------------------------------------------------------------------
-- faqs
-- -----------------------------------------------------------------------------
--
-- The categories are the ones the page groups by. The repository orders groups
-- by `category` ascending and rows by `sort_order` within a group, so the groups
-- read alphabetically — Account, Authentication, Buying, Payment, Returns,
-- Selling, Servicing, Shipping. `sort_order` is the position inside a group, and
-- every group starts at 10 so a question can be inserted between two others
-- without renumbering the rest.
insert into public.faqs (id, question, answer, category, sort_order, is_published)
values
""")

frows = []
for (fid, q, a, cat, order, pub) in FAQS:
    frows.append(
        f"  ('{fid}',\n"
        f"   '{esc(q)}',\n"
        f"   $answer${esc(a)}$answer$,\n"
        f"   '{cat}', {order}, {'true' if pub else 'false'})"
    )
out.write(",\n".join(frows))
out.write("""
on conflict (id) do update
  set question     = excluded.question,
      answer       = excluded.answer,
      category     = excluded.category,
      sort_order   = excluded.sort_order,
      is_published = excluded.is_published,
      updated_at   = now();
""")

open("supabase/seed/04_pages_and_faqs.sql", "w").write(out.getvalue())
print("pages:", len(PAGES), "faqs:", len(FAQS))
for name, blocks in [("about", ABOUT), ("terms", TERMS), ("privacy", PRIVACY), ("shipping", SHIPPING), ("warranty", WARRANTY), ("faq", FAQ_INTRO)]:
    print(name, "blocks:", len(blocks), "figures:", sum(1 for b in blocks if b["type"] == "figure"), "chars:", sum(len(b.get("text", "")) + len(" ".join(b.get("items", []))) for b in blocks))
