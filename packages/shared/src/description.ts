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
  phone?: string;
}

export function generateListingTitle(vehicle: VehicleData): string {
  const parts = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean);
  return parts.join(' ');
}

export function generateTemplateDescription(vehicle: VehicleData): string {
  const title = generateListingTitle(vehicle);
  const lines: string[] = [];

  lines.push(`🚗 ${title}`);
  lines.push('');

  if (vehicle.mileage != null) {
    lines.push(`📍 Mileage: ${vehicle.mileage.toLocaleString()} miles`);
  }
  if (vehicle.exteriorColor) {
    lines.push(`🎨 Exterior: ${vehicle.exteriorColor}`);
  }
  if (vehicle.interiorColor) {
    lines.push(`🪑 Interior: ${vehicle.interiorColor}`);
  }
  if (vehicle.transmission) {
    lines.push(`⚙️ Transmission: ${vehicle.transmission}`);
  }
  if (vehicle.fuelType) {
    lines.push(`⛽ Fuel: ${vehicle.fuelType}`);
  }
  if (vehicle.drivetrain) {
    lines.push(`🔧 Drivetrain: ${vehicle.drivetrain}`);
  }
  if (vehicle.engine) {
    lines.push(`🏎️ Engine: ${vehicle.engine}`);
  }

  if (vehicle.features && vehicle.features.length > 0) {
    lines.push('');
    lines.push('✨ Features:');
    vehicle.features.slice(0, 10).forEach((f) => lines.push(`• ${f}`));
  }

  lines.push('');
  lines.push(
    `This ${vehicle.condition?.toLowerCase() ?? 'well-maintained'} vehicle is ready for its next owner.`
  );

  if (vehicle.dealershipName) {
    lines.push('');
    lines.push(`Contact ${vehicle.dealershipName} today to schedule a test drive!`);
    if (vehicle.phone) {
      lines.push(`📞 ${vehicle.phone}`);
    }
  }

  lines.push('');
  lines.push('—');
  lines.push('Listed via OKauto');

  return lines.join('\n');
}

export function generateMarketplaceTitle(vehicle: VehicleData): string {
  const base = generateListingTitle(vehicle);
  const mileage = vehicle.mileage ? ` - ${vehicle.mileage.toLocaleString()} mi` : '';
  return `${base}${mileage}`.slice(0, 100);
}
