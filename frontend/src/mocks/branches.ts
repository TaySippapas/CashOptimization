// Real Krungthai Bank (KTB) branch locations across Khon Kaen province.
// Coordinates are approximate district/branch centroids (WGS84).
// Source: KTB branch locator (krungthai.com) + Khon Kaen district centers.

export interface RawBranch {
  code: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  isDepot?: boolean;
}

export const RAW_BRANCHES: RawBranch[] = [
  // Regional cash center (depot) — routes start and end here.
  {
    code: "CC-KKN",
    name: "KTB Khon Kaen Cash Center",
    district: "Mueang Khon Kaen",
    lat: 16.4419,
    lng: 102.836,
    isDepot: true,
  },
  // City-center branches (Mueang Khon Kaen)
  { code: "0211", name: "Khon Kaen Branch", district: "Mueang Khon Kaen", lat: 16.4322, lng: 102.8236 },
  { code: "0663", name: "Central Plaza Khon Kaen", district: "Mueang Khon Kaen", lat: 16.4515, lng: 102.814 },
  { code: "0451", name: "Khon Kaen University", district: "Mueang Khon Kaen", lat: 16.4749, lng: 102.8226 },
  { code: "0512", name: "Big C Khon Kaen", district: "Mueang Khon Kaen", lat: 16.4198, lng: 102.8489 },
  { code: "0338", name: "Pratumuang Branch", district: "Mueang Khon Kaen", lat: 16.4291, lng: 102.8305 },
  // Outlying district branches
  { code: "0277", name: "Ban Phai Branch", district: "Ban Phai", lat: 16.06, lng: 102.735 },
  { code: "0421", name: "Chum Phae Branch", district: "Chum Phae", lat: 16.543, lng: 102.1 },
  { code: "0389", name: "Nam Phong Branch", district: "Nam Phong", lat: 16.705, lng: 102.862 },
  { code: "0402", name: "Nong Rua Branch", district: "Nong Rua", lat: 16.499, lng: 102.442 },
  { code: "0455", name: "Mancha Khiri Branch", district: "Mancha Khiri", lat: 16.2, lng: 102.533 },
  { code: "0498", name: "Kranuan Branch", district: "Kranuan", lat: 16.71, lng: 103.09 },
  { code: "0533", name: "Phu Wiang Branch", district: "Phu Wiang", lat: 16.66, lng: 102.36 },
  { code: "0547", name: "Ubol Ratana Branch", district: "Ubol Ratana", lat: 16.77, lng: 102.62 },
  { code: "0561", name: "Nong Song Hong Branch", district: "Nong Song Hong", lat: 15.83, lng: 102.77 },
];
