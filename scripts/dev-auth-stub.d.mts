/**
 * Types for the local auth stub, so the token-signing contract can be unit
 * tested. `allowJs` is off, so without this declaration the import in
 * `tests/auth-stub.test.ts` is an implicit `any`.
 *
 * Keep this in step with the exported members; `tests/auth-stub.test.ts` fails
 * if the token's claims change, which is the behaviour that matters.
 */
export declare function mintAccessToken(userId: string, email: string, secret?: string): string;

export declare const server: import('node:http').Server;
