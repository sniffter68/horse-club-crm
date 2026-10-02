export interface NavItem {
  id: string;
  label: string;
  href: string;
}

export interface HeroContent {
  tagline: string;
  title: string;
  subtitle: string;
  primaryCtaText: string;
  secondaryCtaText: string;
  mediaUrl: string;
}

export interface FeatureSpec {
  label: string;
  value: string;
}

export interface FeatureCard {
  id: string;
  badge: string;
  title: string;
  description: string;
  imageUrl: string;
  specs: FeatureSpec[];
}

export interface ServiceItem {
  id: string;
  title: string;
  category: string;
  price: string;
  description: string;
  imageUrl: string;
}

export interface HorseProfile {
  id: string;
  name: string;
  breed: string;
  age: number;
  discipline: string;
  imageUrl: string;
}

export interface ContactInfo {
  address: string;
  phone: string;
  altPhone: string;
  workingHours: string;
  vkGroup: string;
  coordinates: [number, number];
}

export interface BrandMetadata {
  name: string;
  logoUrl: string;
  legalName: string;
  description: string;
  locale: string;
  location: string;
}

export interface SectionMetadata {
  eyebrow: string;
  title: string;
  description: string;
}

export interface ClubLandingContent {
  brand: BrandMetadata;
  navigation: NavItem[];
  hero: HeroContent;
  infrastructureSection: SectionMetadata;
  infrastructure: FeatureCard[];
  servicesSection: SectionMetadata;
  services: ServiceItem[];
  horsesSection: SectionMetadata;
  horses: HorseProfile[];
  contacts: ContactInfo;
}
