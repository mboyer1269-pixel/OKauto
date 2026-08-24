export interface VehicleData {
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  mileage?: number | null;
  price?: number | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  transmission?: string | null;
  fuelType?: string | null;
  drivetrain?: string | null;
  engine?: string | null;
  bodyStyle?: string | null;
  condition?: string | null;
  features?: string[];
  dealershipName?: string;
  contactName?: string;
  phone?: string;
  vin?: string | null;
  stockNumber?: string | null;
  location?: string | null;
}

export interface MarketplacePackage {
  title: string;
  description: string;
  isReady: boolean;
  blockers: string[];
  warnings: string[];
}

const frenchNumber = new Intl.NumberFormat('fr-CA');
const frenchCurrency = new Intl.NumberFormat('fr-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
});

function cleanValue(value?: string | null): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function inlineValue(value?: string | null): string {
  return cleanValue(value).replace(/[.!]+$/, '');
}

function joinFrenchList(values: string[]): string {
  if (values.length < 2) return values[0] ?? '';
  return `${values.slice(0, -1).join(', ')} et ${values[values.length - 1]}`;
}

function uniqueFeatures(features: string[] = []): string[] {
  const seen = new Set<string>();

  return features
    .map(cleanValue)
    .filter((feature) => {
      if (!feature) return false;
      const key = feature.toLocaleLowerCase('fr-CA');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function generateHumanIntro(vehicle: VehicleData, title: string, dealershipName: string): string[] {
  const lines = [`Je vous présente ce véhicule : ${title || 'un véhicule disponible'}.`];

  if (dealershipName) {
    lines.push(`Il est présentement disponible chez ${dealershipName}.`);
  }

  const configuration = [
    inlineValue(vehicle.engine) ? `un moteur ${inlineValue(vehicle.engine)}` : null,
    inlineValue(vehicle.transmission) ? `une transmission ${inlineValue(vehicle.transmission)}` : null,
    inlineValue(vehicle.drivetrain) ? `un rouage ${inlineValue(vehicle.drivetrain).toLocaleLowerCase('fr-CA')}` : null,
  ].filter((value): value is string => Boolean(value));

  if (configuration.length) {
    lines.push(`Côté configuration, il comprend ${joinFrenchList(configuration)}.`);
  }

  const exteriorColor = cleanValue(vehicle.exteriorColor);
  const interiorColor = cleanValue(vehicle.interiorColor);
  if (exteriorColor && interiorColor) {
    lines.push(`Côté couleurs : ${exteriorColor} à l’extérieur et ${interiorColor} à l’intérieur.`);
  } else if (exteriorColor) {
    lines.push(`Il est présenté en ${exteriorColor}.`);
  }

  return lines;
}

export function generateListingTitle(vehicle: VehicleData): string {
  const parts = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .map((value) => cleanValue(value == null ? '' : String(value)))
    .filter(Boolean);
  return parts.join(' ');
}

export function generateTemplateDescription(vehicle: VehicleData): string {
  const title = generateListingTitle(vehicle);
  const dealershipName = cleanValue(vehicle.dealershipName);
  const contactName = cleanValue(vehicle.contactName);
  const phone = cleanValue(vehicle.phone);
  const location = cleanValue(vehicle.location);
  const lines: string[] = [title || 'Véhicule à vendre'];

  const highlights = [
    vehicle.price != null ? frenchCurrency.format(vehicle.price) : null,
    vehicle.mileage != null ? `${frenchNumber.format(vehicle.mileage)} km` : null,
  ].filter((value): value is string => Boolean(value));

  if (highlights.length) lines.push(highlights.join(' • '));

  lines.push('', ...generateHumanIntro(vehicle, title, dealershipName));

  const details = [
    cleanValue(vehicle.exteriorColor) ? `Couleur extérieure : ${cleanValue(vehicle.exteriorColor)}` : null,
    cleanValue(vehicle.interiorColor) ? `Couleur intérieure : ${cleanValue(vehicle.interiorColor)}` : null,
    cleanValue(vehicle.transmission) ? `Transmission : ${cleanValue(vehicle.transmission)}` : null,
    cleanValue(vehicle.fuelType) ? `Carburant : ${cleanValue(vehicle.fuelType)}` : null,
    cleanValue(vehicle.drivetrain) ? `Rouage : ${cleanValue(vehicle.drivetrain)}` : null,
    cleanValue(vehicle.engine) ? `Moteur : ${cleanValue(vehicle.engine)}` : null,
    cleanValue(vehicle.bodyStyle) ? `Carrosserie : ${cleanValue(vehicle.bodyStyle)}` : null,
  ].filter((line): line is string => Boolean(line));

  if (details.length) {
    lines.push('', 'POINTS CLÉS', ...details.map((detail) => `• ${detail}`));
  }

  const features = uniqueFeatures(vehicle.features).slice(0, 8);
  if (features.length) {
    lines.push('', 'ÉQUIPEMENTS À RETENIR', ...features.map((feature) => `• ${feature}`));
  }

  lines.push('', 'VOUS VOULEZ LE VOIR?');

  if (contactName) {
    lines.push(
      `Écrivez-moi directement ici sur Messenger — ${contactName}.`,
      phone
        ? `Vous pouvez aussi m’appeler directement à la concession au ${phone} et demander ${contactName}.`
        : `Vous pouvez aussi appeler directement à la concession et demander ${contactName}.`,
      'Je pourrai confirmer la disponibilité, répondre à vos questions et planifier votre visite ou votre essai routier.'
    );
  } else {
    lines.push(
      'Écrivez-nous directement sur Marketplace pour vérifier la disponibilité, poser vos questions ou planifier une visite et un essai routier.'
    );
    if (phone) lines.push(`Téléphone : ${phone}`);
  }

  if (location) lines.push(`Emplacement : ${location}`);

  const references = [
    cleanValue(vehicle.stockNumber) ? `stock ${cleanValue(vehicle.stockNumber)}` : null,
    cleanValue(vehicle.vin) ? `NIV ${cleanValue(vehicle.vin)}` : null,
  ].filter((value): value is string => Boolean(value));
  if (references.length) lines.push('', `Référence : ${references.join(' • ')}`);

  lines.push(
    '',
    'Disponibilité et informations à confirmer auprès du concessionnaire.',
    'Prix affiché avant TPS, TVQ et droit spécifique sur les pneus neufs, le cas échéant. Aucun frais obligatoire additionnel.'
  );

  return lines.join('\n');
}

export function validateMarketplacePackage(vehicle: VehicleData): Pick<MarketplacePackage, 'isReady' | 'blockers' | 'warnings'> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const condition = vehicle.condition?.toLowerCase() ?? '';
  const isUsed = condition.includes('used') || condition.includes('usag') || vehicle.mileage != null;

  if (!generateListingTitle(vehicle)) blockers.push('Année, marque et modèle requis.');
  if (vehicle.price == null || vehicle.price <= 0) blockers.push('Prix de vente requis.');
  if (isUsed && vehicle.mileage == null) blockers.push('Kilométrage requis pour un véhicule usagé.');
  if (!vehicle.stockNumber) warnings.push('Numéro de stock manquant.');
  if (!vehicle.vin) warnings.push('NIV manquant.');
  if (!vehicle.dealershipName) warnings.push('Nom du concessionnaire manquant.');
  if (!vehicle.contactName) warnings.push('Nom du conseiller Marketplace manquant.');

  return { isReady: blockers.length === 0, blockers, warnings };
}

export function generateMarketplacePackage(vehicle: VehicleData): MarketplacePackage {
  const validation = validateMarketplacePackage(vehicle);
  return {
    title: generateMarketplaceTitle(vehicle),
    description: generateTemplateDescription(vehicle),
    ...validation,
  };
}

export function generateMarketplaceTitle(vehicle: VehicleData): string {
  return generateListingTitle(vehicle).slice(0, 100);
}
