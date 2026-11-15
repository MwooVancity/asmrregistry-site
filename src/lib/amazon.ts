// One place for the Amazon Associates tracking ID, so a link can never ship untagged.
//
// Links render as /go/?q=... (blocked in robots.txt) with data-amz. EarphoneBanner's script swaps in the direct
// Amazon URL when a person hovers, focuses or taps, so hovering shows the real destination and the click goes
// straight to Amazon. Nothing redirects: Amazon's policy restricts links sent "indirectly ... via an intermediate
// site". Why: 11,599 clicks and 0 orders in 30 days means bots were following Amazon URLs found in the HTML.
export const AMAZON_TAG = '220a102-20';
// Amazon's own ranking: sorted by Best Sellers, capped at $20. We pick nothing; the list stays current by itself.
export const AMAZON_BEST = '&rh=p_36%3A-2000&s=exact-aware-popularity-rank';
export const amazonDirect = (q: string, best = false) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}${best ? AMAZON_BEST : ''}&tag=${AMAZON_TAG}`;
export const amazonSearch = (q: string, best = false) => `/go/?q=${encodeURIComponent(q)}${best ? '&best=1' : ''}`;
// A specific product page, for the ads. Chosen from Amazon's Best Sellers charts; recheck them from time to time.
export const amazonProductDirect = (asin: string) => `https://www.amazon.com/dp/${asin}?tag=${AMAZON_TAG}`;
export const amazonProduct = (asin: string, name: string) => `/go/?asin=${asin}&q=${encodeURIComponent(name)}`;
