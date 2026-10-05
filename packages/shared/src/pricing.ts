export const QC_GST_RATE = 0.05;
export const QC_QST_RATE = 0.09975;
export const QC_TIRE_FEE_PER_TIRE = 4.5;

export interface PricingFees {
  freightFee?: number | null;
  pdiFee?: number | null;
  adminFee?: number | null;
  acExciseFee?: number | null;
}

export interface AdvertisedPriceBreakdown {
  basePrice: number;
  freightFee: number;
  pdiFee: number;
  adminFee: number;
  acExciseFee: number;
  mandatoryFeesTotal: number;
  advertisedPrice: number;
  gst: number;
  qst: number;
  estimatedTireFee: number;
  estimatedTotalWithTaxes: number;
}

function money(value?: number | null): number {
  if (value == null || !Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100) / 100;
}

export function mergePricingFees(
  organization?: PricingFees | null,
  vehicle?: PricingFees | null,
): Required<PricingFees> {
  return {
    freightFee: vehicle?.freightFee ?? organization?.freightFee ?? 0,
    pdiFee: vehicle?.pdiFee ?? organization?.pdiFee ?? 0,
    adminFee: vehicle?.adminFee ?? organization?.adminFee ?? 0,
    acExciseFee: vehicle?.acExciseFee ?? organization?.acExciseFee ?? 0,
  };
}

/**
 * Prix annoncé LPC/OPC : tous les frais obligatoires du commerçant,
 * hors TPS, TVQ et droit spécifique sur les pneus neufs.
 * @see https://www.opc.gouv.qc.ca/commercant/secteur/vehicule/publicite/regle/prix
 */
export function computeQuebecAdvertisedPrice(
  basePrice: number | null | undefined,
  fees?: PricingFees | null,
  options?: { newTireCount?: number },
): AdvertisedPriceBreakdown | null {
  if (basePrice == null || !Number.isFinite(basePrice) || basePrice <= 0) {
    return null;
  }

  const freightFee = money(fees?.freightFee);
  const pdiFee = money(fees?.pdiFee);
  const adminFee = money(fees?.adminFee);
  const acExciseFee = money(fees?.acExciseFee);
  const mandatoryFeesTotal = money(
    freightFee + pdiFee + adminFee + acExciseFee,
  );
  const advertisedPrice = money(basePrice + mandatoryFeesTotal);
  const gst = money(advertisedPrice * QC_GST_RATE);
  const qst = money(advertisedPrice * QC_QST_RATE);
  const estimatedTireFee = money(
    (options?.newTireCount ?? 0) * QC_TIRE_FEE_PER_TIRE,
  );

  return {
    basePrice: money(basePrice),
    freightFee,
    pdiFee,
    adminFee,
    acExciseFee,
    mandatoryFeesTotal,
    advertisedPrice,
    gst,
    qst,
    estimatedTireFee,
    estimatedTotalWithTaxes: money(
      advertisedPrice + gst + qst + estimatedTireFee,
    ),
  };
}
