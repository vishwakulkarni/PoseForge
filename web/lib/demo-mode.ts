/**
 * True in the static demo build (the public site): the real app, read-only, with
 * its API answered from captured sample data instead of a server. See
 * scripts/capture-demo-fixtures.js and lib/api/demo.ts.
 */
export const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === 'true';
