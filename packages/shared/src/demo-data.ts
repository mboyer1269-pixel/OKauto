import type { DashboardResponse, VehicleInput } from "./schemas.js";
import { buildListingTitle, buildMarketplaceDescription } from "./description.js";

export const demoVehicles: Array<VehicleInput & { id: string; updatedAt: string; salesperson?: string; listingStatus?: DashboardResponse["listings"][number]["status"]; photoCount: number }> = [
  {
    id: "veh-demo-1",
    vin: "1HGCM82633A004352",
    stockNumber: "A1024",
    year: 2022,
    make: "Toyota",
    model: "Camry",
    trim: "SE",
    bodyStyle: "Sedan",
    drivetrain: "FWD",
    transmission: "Automatic",
    fuelType: "Gasoline",
    exteriorColor: "Blueprint",
    interiorColor: "Black",
    mileage: 30210,
    price: 23995,
    status: "AVAILABLE",
    location: "Findlay, OH",
    features: ["Apple CarPlay", "Backup Camera", "Adaptive Cruise", "Lane Assist"],
    notes: "Clean local trade with service records.",
    updatedAt: "2026-07-29T18:15:00.000Z",
    salesperson: "Avery Johnson",
    listingStatus: "POSTED",
    photoCount: 18
  },
  {
    id: "veh-demo-2",
    vin: "5YJ3E1EA7KF317000",
    stockNumber: "EV455",
    year: 2019,
    make: "Tesla",
    model: "Model 3",
    trim: "Standard Range Plus",
    bodyStyle: "Sedan",
    drivetrain: "RWD",
    transmission: "Single-Speed",
    fuelType: "Electric",
    exteriorColor: "Pearl White",
    interiorColor: "Black",
    mileage: 48750,
    price: 25950,
    status: "AVAILABLE",
    location: "Findlay, OH",
    features: ["Navigation", "Glass Roof", "Heated Seats", "Autopilot"],
    updatedAt: "2026-07-30T00:35:00.000Z",
    salesperson: "Morgan Lee",
    listingStatus: "PRICE_CHANGE",
    photoCount: 12
  },
  {
    id: "veh-demo-3",
    stockNumber: "TRK778",
    year: 2021,
    make: "Ford",
    model: "F-150",
    trim: "XLT SuperCrew",
    bodyStyle: "Truck",
    drivetrain: "4WD",
    transmission: "Automatic",
    fuelType: "Gasoline",
    exteriorColor: "Oxford White",
    mileage: 64200,
    price: 32900,
    status: "SOLD",
    location: "Findlay, OH",
    features: ["Tow Package", "Bedliner", "Remote Start"],
    updatedAt: "2026-07-30T01:05:00.000Z",
    salesperson: "Avery Johnson",
    listingStatus: "SOLD_ALERT",
    photoCount: 20
  }
];

export const demoDashboard: DashboardResponse = {
  metrics: [
    { label: "Active inventory", value: 42, delta: "+7 this week", tone: "good" },
    { label: "Ready to list", value: 11, delta: "3 need photos", tone: "warn" },
    { label: "Posted listings", value: 31, delta: "74% coverage", tone: "neutral" },
    { label: "Sold alerts", value: 2, delta: "action needed", tone: "critical" }
  ],
  inventory: demoVehicles,
  listings: demoVehicles.map((vehicle, index) => ({
    id: `lst-demo-${index + 1}`,
    vehicleId: vehicle.id,
    title: buildListingTitle(vehicle),
    status: vehicle.listingStatus ?? "DRAFT",
    salesperson: vehicle.salesperson,
    marketplaceUrl: index === 0 ? "https://www.facebook.com/marketplace/item/demo" : undefined,
    postedAt: index === 0 ? "2026-07-29T19:00:00.000Z" : undefined,
    updatedAt: vehicle.updatedAt
  })),
  activity: [
    {
      id: "act-demo-1",
      actor: "Avery Johnson",
      action: "posted",
      target: "2022 Toyota Camry SE",
      createdAt: "2026-07-29T19:00:00.000Z"
    },
    {
      id: "act-demo-2",
      actor: "System",
      action: "detected price change",
      target: "2019 Tesla Model 3",
      createdAt: "2026-07-30T00:35:00.000Z"
    },
    {
      id: "act-demo-3",
      actor: "System",
      action: "created sold alert",
      target: "2021 Ford F-150",
      createdAt: "2026-07-30T01:05:00.000Z"
    }
  ],
  notifications: [
    {
      id: "not-demo-1",
      type: "SOLD_ALERT",
      title: "Remove sold F-150 listing",
      message: "Inventory source marked TRK778 sold. Confirm Marketplace listing removal.",
      severity: "critical"
    },
    {
      id: "not-demo-2",
      type: "PRICE_CHANGE",
      title: "Tesla price changed",
      message: "EV455 changed to $25,950. Update active listing copy before the next lead response.",
      severity: "warning"
    }
  ],
  syncHealth: [
    {
      source: "Dealer website",
      status: "healthy",
      lastRunAt: "2026-07-30T01:15:00.000Z",
      message: "41 vehicles synced, 0 errors"
    },
    {
      source: "CSV import",
      status: "warning",
      lastRunAt: "2026-07-29T22:00:00.000Z",
      message: "2 rows skipped due to missing year/make/model"
    }
  ]
};

export function demoDescriptionFor(vehicleId: string): string {
  const vehicle = demoVehicles.find((candidate) => candidate.id === vehicleId) ?? demoVehicles[0];
  return buildMarketplaceDescription(vehicle, {
    dealershipName: "OKauto Demo Motors",
    city: vehicle.location
  });
}
