import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getComparableQuotationTotal, getMinimumPositiveQuotationTotal } from '@/lib/procurement/quotation-validation';

export async function POST(req: Request) {
  try {
    const { canvassId } = await req.json();

    if (!canvassId) {
      return NextResponse.json({ success: false, error: 'Missing canvassId' }, { status: 400 });
    }

    // Fetch all quotations for this canvass
    const canvass = await prisma.canvassForm.findUnique({
      where: { id: canvassId },
      include: {
        items: { select: { id: true, quantityRequired: true } },
        quotations: { include: { supplier: true, items: true } }
      }
    });

    if (!canvass) {
      return NextResponse.json({ success: false, error: 'Canvass not found' }, { status: 404 });
    }

    if (canvass.quotations.length === 0) {
      return NextResponse.json({ success: false, error: 'No quotations found to compare' }, { status: 400 });
    }

    const fullCoverageQuotes: Array<{ quotation: typeof canvass.quotations[number]; comparableTotal: number }> = [];
    const excludedQuotes: Array<{ quotation: typeof canvass.quotations[number]; reason: string }> = [];
    for (const quotation of canvass.quotations) {
      try {
        const comparableTotal = getComparableQuotationTotal(canvass.items, quotation.items);
        if (comparableTotal === null) {
          excludedQuotes.push({ quotation, reason: 'Partial availability — not compared as full fulfillment.' });
        } else {
          fullCoverageQuotes.push({ quotation, comparableTotal });
        }
      } catch (error) {
        excludedQuotes.push({ quotation, reason: error instanceof Error ? error.message : 'Invalid quote price.' });
      }
    }
    if (fullCoverageQuotes.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid quotation covers every requested quantity. Comparison was not saved; collect complete-scope quotations before running an automatic recommendation.',
        partialOffers: excludedQuotes.map(({ quotation, reason }) => ({
          supplierName: quotation.supplier.name,
          reason,
        })),
      }, { status: 400 });
    }

    let minPrice: number;
    try {
      minPrice = getMinimumPositiveQuotationTotal(fullCoverageQuotes.map(entry => entry.comparableTotal));
    } catch (error) {
      return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Quotation totals must be finite and positive before comparison.' }, { status: 400 });
    }

    // Simulate AI Processing Time
    await new Promise(resolve => setTimeout(resolve, 3500));

    // Find the cheapest quotation
    // Helper functions for scoring
    const parseDeliveryScore = (d: string | null) => {
      if (!d) return 50;
      if (d.includes('On-hand')) return 100;
      if (d.includes('7 Days')) return 90;
      if (d.includes('14 Days')) return 80;
      if (d.includes('30 Days')) return 60;
      if (d.includes('45 Days')) return 40;
      return 50;
    };

    const parsePaymentScore = (p: string | null) => {
      if (!p) return 50;
      if (p.includes('60 Days')) return 100;
      if (p.includes('30 Days')) return 90;
      if (p.includes('15 Days')) return 80;
      if (p.includes('50%')) return 70;
      if (p.includes('COD')) return 50;
      return 50;
    };

    // Calculate score for each
    const scoredQuotations = fullCoverageQuotes.map(({ quotation: q, comparableTotal }) => {
      const priceScore = (minPrice / comparableTotal) * 100;
      const deliveryScore = parseDeliveryScore(q.deliveryPeriod);
      const paymentScore = parsePaymentScore(q.paymentTerms);
      
      const totalScore = (priceScore * 0.6) + (deliveryScore * 0.2) + (paymentScore * 0.2);
      return { ...q, comparableTotal, score: totalScore, priceScore, deliveryScore, paymentScore };
    });

    // Sort by score descending
    scoredQuotations.sort((a, b) => b.score - a.score);
    const recommendedQuotation = scoredQuotations[0];

    // Build Rationale for each
    const rankedFullQuotes = scoredQuotations.map((q, index) => {
      let rationale = "";
      if (index === 0) {
        if (q.priceScore === 100) {
          rationale = `Rank 1: Chosen for the lowest comparable price for the full requested quantities (₱${q.comparableTotal.toLocaleString()}) combined with solid ${q.deliveryPeriod || 'standard'} delivery and ${q.paymentTerms || 'standard'} payment terms.`;
        } else {
          rationale = `Rank 1: Despite not having the lowest comparable price for the full requested quantities, the superior ${q.deliveryPeriod || 'standard'} delivery and ${q.paymentTerms || 'standard'} terms make it the most competitive overall.`;
        }
      } else {
        rationale = `Rank ${index + 1}: Not recommended. `;
        if (q.priceScore < 100) rationale += `Price is higher than the best offer. `;
        if (q.deliveryScore < recommendedQuotation.deliveryScore) rationale += `Delivery period is slower. `;
        if (q.paymentScore < recommendedQuotation.paymentScore) rationale += `Payment terms are less favorable.`;
      }
      return { ...q, aiRank: index + 1, aiRationale: rationale.trim() };
    });
    const excludedRankings = excludedQuotes.map(({ quotation, reason }) => ({
      ...quotation,
      aiRank: null,
      aiRationale: reason,
    }));
    const rankedQuotations = [...rankedFullQuotes, ...excludedRankings];

    // Build AI Summary
    let summary = `🤖 **AI Quotation Analysis & Recommendation**\n\n`;
    summary += `Compared ${scoredQuotations.length} full-coverage supplier quotations based on comparable full-request price (60%), Delivery Period (20%), and Payment Terms (20%). ${excludedQuotes.length} incomplete or invalid offer(s) were excluded from automatic ranking.\n`;
    summary += `Source-document verification is separate from this comparison; the comparison uses recorded quantities, prices, and terms.\n\n`;
    summary += `**Rankings:**\n`;
    rankedFullQuotes.forEach(q => {
      summary += `${q.aiRank}. **${q.supplier.name}** - Comparable requested-scope price: ₱${q.comparableTotal.toLocaleString()} | Delivery: ${q.deliveryPeriod} | Payment: ${q.paymentTerms}\n`;
      summary += `   Quoted available-quantity subtotal: ₱${q.totalAmount.toLocaleString()}\n`;
      summary += `   *Rationale:* ${q.aiRationale}\n\n`;
    });
    excludedRankings.forEach(q => {
      summary += `• **${q.supplier.name}** — ${q.aiRationale} Quoted subtotal: ₱${q.totalAmount.toLocaleString()}\n\n`;
    });
    
    summary += `**Recommendation:**\n`;
    summary += `I recommend proceeding with **${recommendedQuotation.supplier.name}** as they offer the highest overall competitiveness score.`;

    // Update DB
    const transactionOperations = rankedQuotations.map(q => 
      prisma.supplierQuotation.update({
        where: { id: q.id },
        data: { 
          isRecommended: q.id === recommendedQuotation.id,
          aiRank: q.aiRank,
          aiRationale: q.aiRationale
        }
      })
    );

    transactionOperations.push(
      prisma.canvassForm.update({
        where: { id: canvassId },
        data: { 
          aiSummary: summary,
          recommendedSupplierId: recommendedQuotation.supplierId
        }
      }) as any
    );

    await prisma.$transaction(transactionOperations);

    return NextResponse.json({
      success: true,
      summary,
      partialOffers: excludedQuotes.map(({ quotation, reason }) => ({
        supplierName: quotation.supplier.name,
        reason,
      })),
    });
  } catch (error: any) {
    console.error('Error comparing quotations:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to analyze quotations' }, { status: 500 });
  }
}
