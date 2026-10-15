// Monthly sales report. Finance parses this text, so its exact format is part of the contract.

const DISCOUNT_TIERS = [
  { minGross: 100000, rate: 0.1 },
  { minGross: 50000, rate: 0.05 },
];

function formatMoney(cents, currency) {
  const amount = (cents / 100).toFixed(2);
  return currency === 'EUR' ? `${amount.replace('.', ',')} EUR` : `$${amount}`;
}

function totalsByCustomer(orders) {
  const customers = {};
  for (const order of orders) {
    const totals = (customers[order.customer] ??= { gross: 0, refunds: 0, count: 0 });
    if (order.refunded) {
      totals.refunds += order.amountCents;
    } else {
      totals.gross += order.amountCents;
      totals.count += 1;
    }
  }
  return customers;
}

function discountFor(gross) {
  const tier = DISCOUNT_TIERS.find((candidate) => gross >= candidate.minGross);
  return tier ? Math.round(gross * tier.rate) : 0;
}

function customerLine(name, totals, discount, net, currency) {
  const discountPart = discount > 0 ? `, discount ${formatMoney(discount, currency)}` : '';
  return `${name}: ${formatMoney(net, currency)} (${totals.count} orders${discountPart})`;
}

export function buildReport(orders, options = {}) {
  if (orders.length === 0) return 'No orders.';
  const currency = options.currency || 'USD';
  const customers = totalsByCustomer(orders);
  const lines = [];
  let total = 0;
  let totalRefunds = 0;
  for (const name of Object.keys(customers).sort()) {
    const totals = customers[name];
    const discount = discountFor(totals.gross);
    const net = totals.gross - discount - totals.refunds;
    total += net;
    totalRefunds += totals.refunds;
    lines.push(customerLine(name, totals, discount, net, currency));
  }
  lines.push(`TOTAL: ${formatMoney(total, currency)}`);
  if (totalRefunds > 0) lines.push(`REFUNDS: ${formatMoney(totalRefunds, currency)}`);
  return lines.join('\n');
}
