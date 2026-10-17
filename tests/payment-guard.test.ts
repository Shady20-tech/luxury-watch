import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Behavioural tests for the payment-provider guard.
 *
 * The guard protects a core project invariant — no online payment processing
 * ever enters this codebase — so it is tested the same way as any other
 * security control: by proving it actually rejects a violation, not merely that
 * it passes on the current, clean tree.
 */
const SCRIPT = fileURLToPath(new URL('../scripts/check-no-payment-providers.mjs', import.meta.url));

const fixtures: string[] = [];

function makeFixture(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), 'payment-guard-'));
  fixtures.push(directory);

  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(directory, relativePath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content);
  }

  return directory;
}

function runGuard(cwd: string): { code: number; output: string } {
  try {
    const output = execFileSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });
    return { code: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      code: failure.status ?? 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
}

afterAll(() => {
  for (const directory of fixtures) rmSync(directory, { recursive: true, force: true });
});

describe('payment guard on a clean tree', () => {
  it('passes when no payment integration is present', () => {
    const directory = makeFixture({
      'package.json': JSON.stringify({ dependencies: { next: '15.5.28', zod: '4.6.7' } }),
      'src/app/page.tsx': 'export default function Page() { return <p>Hello</p>; }',
    });

    const { code, output } = runGuard(directory);
    expect(code).toBe(0);
    expect(output).toContain('Payment-provider check passed');
  });

  it('passes a file that merely mentions an order request with a manual payment method', () => {
    const directory = makeFixture({
      'src/lib/order-request.ts':
        "export const METHODS = ['bank_transfer', 'cash_on_pickup'] as const;\n",
    });

    expect(runGuard(directory).code).toBe(0);
  });
});

describe('payment guard rejects violations', () => {
  it('fails on a Stripe dependency', () => {
    const directory = makeFixture({
      'package.json': JSON.stringify({ dependencies: { stripe: '17.0.0' } }),
    });

    const { code, output } = runGuard(directory);
    expect(code).toBe(1);
    expect(output).toContain('stripe');
  });

  it('fails on a PayPal SDK import', () => {
    const directory = makeFixture({
      'src/lib/pay.ts': "import { loadScript } from '@paypal/paypal-js';\n",
    });

    const { code, output } = runGuard(directory);
    expect(code).toBe(1);
    expect(output).toContain('payment dependency');
  });

  it('fails on a card number input field', () => {
    const directory = makeFixture({
      'src/components/checkout.tsx': '<input name="cardNumber" autoComplete="cc-number" />\n',
    });

    const { code, output } = runGuard(directory);
    expect(code).toBe(1);
    expect(output).toContain('card number field');
  });

  it('fails on a CVV field', () => {
    const directory = makeFixture({
      'src/components/checkout.tsx': '<input name="cvv" inputMode="numeric" />\n',
    });

    const { code, output } = runGuard(directory);
    expect(code).toBe(1);
    expect(output).toContain('card verification field');
  });

  it('fails on a Stripe secret key committed by mistake', () => {
    const directory = makeFixture({
      'src/lib/config.ts': "export const key = 'sk_live_ABCDEFGH12345678';\n",
    });

    const { code, output } = runGuard(directory);
    expect(code).toBe(1);
    expect(output).toContain('stripe secret key');
  });

  it('fails on a payment webhook handler', () => {
    const directory = makeFixture({
      'src/app/api/stripe-webhook/route.ts': 'export async function POST() {}\n',
    });

    const { code, output } = runGuard(directory);
    expect(code).toBe(1);
    expect(output).toContain('payment webhook');
  });

  it('reports the file and line so the violation is easy to locate', () => {
    const directory = makeFixture({
      'src/lib/bad.ts': 'const a = 1;\nconst b = 2;\nconst stripe = "stripe";\n',
    });

    const { output } = runGuard(directory);
    expect(output).toContain('src/lib/bad.ts:3');
  });
});
