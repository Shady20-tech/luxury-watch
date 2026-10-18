import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ProductDetail } from '@/lib/product/types';

/**
 * Price and availability block.
 *
 * The honesty rule for the whole storefront lives here: a product either has a
 * genuine published price or it is priced on request, and the two states never
 * look alike. There is no "from" figure, no struck-through comparison price and
 * no placeholder number — `price` is `null` exactly when the database says the
 * piece is price-on-request, and that is what renders the enquiry prompt.
 *
 * Availability is stated separately from price, because they are different
 * facts: a watch can be priced and reserved, or priced on request and available.
 * Collapsing them into one badge would lose that.
 */
export function PriceBlock({ product, className }: { product: ProductDetail; className?: string }) {
  return (
    <div className={cn('border-line-200 border-y py-5', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          {product.price ? (
            <p className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {product.price}
              {/* The currency is stated in words only when the formatted price
                  does not already carry a symbol a visitor would recognise. The
                  formatter emits a symbol, so this is the accessible duplicate
                  for a screen reader rather than visible clutter. */}
              <span className="sr-only"> {product.currency}</span>
            </p>
          ) : (
            <p className="text-xl font-semibold tracking-tight sm:text-2xl">
              Request pricing &amp; availability
            </p>
          )}

          {!product.price ? (
            <p className="text-foreground-muted mt-1 text-sm">
              This piece is offered by enquiry. Send us a message and we will confirm the current
              price, condition report and availability.
            </p>
          ) : null}
        </div>

        <Badge variant={product.availability === 'available' ? 'success' : 'neutral'}>
          {product.availability === 'available' ? 'Available' : 'Reserved'}
        </Badge>
      </div>

      <dl className="text-foreground-muted mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {product.reference ? (
          <div className="flex gap-2">
            <dt className="font-medium">Reference</dt>
            <dd>{product.reference}</dd>
          </div>
        ) : null}
        {product.conditionLabel ? (
          <div className="flex gap-2">
            <dt className="font-medium">Condition</dt>
            <dd>{product.conditionLabel}</dd>
          </div>
        ) : null}
        {product.year ? (
          <div className="flex gap-2">
            <dt className="font-medium">Year</dt>
            <dd>{product.year}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
