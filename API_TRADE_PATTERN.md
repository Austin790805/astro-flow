# Key findings for fixing Bulk Trader trade execution

## The problem
The current Bulk Trader uses `api_base.api.send({buy: 1, ...})` with `parameters.symbol` but the correct pattern uses `parameters.underlying_symbol` and a `proposal` step first.

## Correct trade execution pattern (from Purchase.js and helpers.js):

### Method 1: Using proposal first (recommended)
1. Send proposal: `{ proposal: 1, amount, basis, contract_type, currency, duration, duration_unit, underlying_symbol, barrier, passthrough: { purchase_reference } }`
2. Listen for `proposal` message to get `id` and `ask_price`
3. Buy: `{ buy: proposalId, price: askPrice }`

### Method 2: Direct buy (from tradeOptionToBuy)
```js
const buy = {
    buy: '1',
    price: amount,
    parameters: {
        amount: stakeAmount,
        basis: 'stake',
        contract_type: 'DIGITEVEN', // or DIGITODD, DIGITOVER, DIGITUNDER, DIGITMATCH, DIGITDIFF, CALL, PUT
        currency: 'AUD',
        duration: 1,
        duration_unit: 't',
        underlying_symbol: '1HZ100V',  // NOT 'symbol'!
    },
};
// For digit contracts:
buy.parameters.selected_tick = lastDigit;  // or barrier
if (!['TICKLOW', 'TICKHIGH'].includes(contract_type)) {
    buy.parameters.barrier = lastDigit;
}
```

## API interface
- `api_base.api.send(data)` - sends request, returns void in TypeScript but actually returns Promise at runtime
- `api_base.api.onMessage().subscribe(callback)` - listen for messages
- Forgetting subscription: `api.send({ forget: subscriptionId })` NOT `api.forget(id)`
- Global subscriptions already include: 'balance', 'transaction', 'proposal_open_contract'

## Contract types
- DIGITEVEN, DIGITODD (even/odd)
- DIGITOVER, DIGITUNDER (over/under, needs barrier)
- DIGITMATCH, DIGITDIFF (match/differ, needs barrier)
- CALL (rise), PUT (fall)

## Duration for 1 tick
- duration: 1, duration_unit: 't' (tick)

## Key insight
The `api_base.api.send()` type says it returns void, but at runtime it returns a Promise. The Bulk Trader was using `await api_base.api.send()` which should work at runtime but the TypeScript compilation might be stripping the await. The main issue was likely:
1. Using `parameters.symbol` instead of `parameters.underlying_symbol`
2. The `forget` call failing silently
3. Possible race condition with the subscription
