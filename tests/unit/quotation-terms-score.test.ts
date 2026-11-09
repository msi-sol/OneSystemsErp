import { deliveryScore, paymentScore, termDays } from '@/lib/procurement/quotation-terms-score';

describe('quotation delivery and payment terms scoring', () => {
  it('reads days from common phrasings', () => {
    expect(termDays('7 days')).toBe(7);
    expect(termDays('2 weeks')).toBe(14);
    expect(termDays('1 month')).toBe(30);
    expect(termDays('PDC 30')).toBe(30);
    expect(termDays('upon order')).toBeNull();
  });

  it('scores faster delivery higher and keeps missing delivery neutral', () => {
    expect(deliveryScore('On-hand')).toBe(100);
    expect(deliveryScore('7 Days')).toBe(90);
    expect(deliveryScore('2 weeks')).toBe(80);
    expect(deliveryScore('30 days')).toBe(60);
    expect(deliveryScore('')).toBe(50);
    expect(deliveryScore(null)).toBe(50);
  });

  it('scores the payment options the supplier form offers', () => {
    expect(paymentScore('PDC 60')).toBe(100);
    expect(paymentScore('PDC 30')).toBe(90);
    expect(paymentScore('Net 15')).toBe(80);
    expect(paymentScore('CASH ON DELIVERY')).toBe(50);
    expect(paymentScore('DATED CHECK ON DELIVERY')).toBe(50);
    expect(paymentScore('BANK TRANSFER')).toBe(50);
    expect(paymentScore('Full payment in advance')).toBe(30);
    expect(paymentScore(undefined)).toBe(50);
    expect(paymentScore('PDC 30')).toBeGreaterThan(paymentScore('CASH ON DELIVERY'));
  });
});
