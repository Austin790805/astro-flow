/**
 * Digit analysis utilities for D Circle and Bulk Trader tools.
 *
 * IMPORTANT — counting digit 0 correctly:
 * The Deriv API returns prices as JSON numbers. A price of 609.50 with
 * pip_size 2 is received as the number 609.5, so a naive
 *   quote.toString().replace('.', '')
 * would read the last digit as 5 instead of 0.
 *
 * These helpers re-pad the fractional part to exactly pip_size digits
 * before extracting the last digit, so trailing zeros are preserved.
 */

/** Well-known pip sizes for synthetic index markets, keyed by symbol. */
export const PIP_SIZE_BY_SYMBOL: Record<string, number> = {
    R_10: 3,
    R_25: 3,
    R_50: 4,
    R_75: 4,
    R_100: 2,
    '1HZ10V': 2,
    '1HZ25V': 2,
    '1HZ50V': 2,
    '1HZ75V': 2,
    '1HZ100V': 2,
};

/**
 * Format a price so its fractional part always has `pipSize` digits,
 * e.g. 609.5 with pipSize 2 becomes "609.50".
 */
export const formatQuote = (quote: string | number, pipSize: number): string => {
    const num = Number(quote);
    if (Number.isNaN(num)) return '0';
    const str = num.toString();
    const dotIdx = str.indexOf('.');
    if (dotIdx === -1) {
        // Integer price — pad with pipSize zeros
        return `${str}.${'0'.repeat(pipSize)}`;
    }
    const fracLen = str.length - dotIdx - 1;
    if (fracLen < pipSize) {
        return `${str}${'0'.repeat(pipSize - fracLen)}`;
    }
    return str;
};

/**
 * Extract the last decimal digit of a price, preserving trailing zeros
 * via pip size padding.
 */
export const getLastDigit = (quote: string | number, pipSize: number = 2): number => {
    const padded = formatQuote(quote, pipSize);
    return parseInt(padded.charAt(padded.length - 1), 10);
};

/**
 * Analyze an array of raw price ticks and return digit counts,
 * the ordered digit history, and the last digit seen.
 */
export const analyzeDigitsFromPrices = (
    prices: (string | number)[],
    pipSize: number = 2
): { digitCounts: number[]; history: string[]; lastDigit: number } => {
    const digitCounts = Array(10).fill(0);
    const history: string[] = [];

    prices.forEach(price => {
        const digit = getLastDigit(price, pipSize);
        digitCounts[digit]++;
        history.push(String(digit));
    });

    const lastDigit = prices.length > 0 ? getLastDigit(prices[prices.length - 1], pipSize) : 0;
    return { digitCounts, history, lastDigit };
};
