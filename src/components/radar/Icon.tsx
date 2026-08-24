import {
  IconBookmark,
  IconChartHistogram,
  IconChevronRight,
  IconCircleCheck,
  IconCompass,
  IconDevices,
  IconExternalLink,
  IconFileDescription,
  IconHome,
  IconInbox,
  IconLogout,
  IconMap2,
  IconMenu2,
  IconRadar2,
  IconRefresh,
  IconSearch,
  IconStack2,
  IconTargetArrow,
  IconUser,
  IconX,
  type TablerIcon
} from '@tabler/icons-react';

export type IconName = 'bookmark' | 'external' | 'search' | 'user' | 'close' | 'menu' | 'chevron' | 'logout' | 'devices' | 'home' | 'map' | 'compass' | 'radar' | 'chart' | 'target' | 'cycle' | 'document' | 'inbox' | 'layers' | 'check';

const icons: Record<IconName, TablerIcon> = {
  bookmark: IconBookmark,
  external: IconExternalLink,
  search: IconSearch,
  user: IconUser,
  close: IconX,
  menu: IconMenu2,
  chevron: IconChevronRight,
  logout: IconLogout,
  devices: IconDevices,
  home: IconHome,
  map: IconMap2,
  compass: IconCompass,
  radar: IconRadar2,
  chart: IconChartHistogram,
  target: IconTargetArrow,
  cycle: IconRefresh,
  document: IconFileDescription,
  inbox: IconInbox,
  layers: IconStack2,
  check: IconCircleCheck
};

export default function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const Component = icons[name];
  return <Component size={size} stroke={1.8} aria-hidden="true" focusable="false" />;
}
