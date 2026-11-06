/** Line icons, used only by the admin dashboard. The reader-facing paper uses no icons. */
import {
  IconActivity,
  IconActivityHeartbeat,
  IconAlertTriangle,
  IconArticle,
  IconCalendarEvent,
  IconChartHistogram,
  IconChartLine,
  IconCircleCheck,
  IconClock,
  IconCloudUpload,
  IconCompass,
  IconDatabase,
  IconDatabaseSearch,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconDevices,
  IconExternalLink,
  IconEye,
  IconLock,
  IconMessageQuestion,
  IconRoute,
  IconShieldLock,
  IconStack2,
  IconUserPlus,
  IconUsers,
  IconWorld,
  type TablerIcon
} from '@tabler/icons-react';

export type IconName = 'activity' | 'alert' | 'article' | 'calendar' | 'chart' | 'chartLine' | 'check' | 'clock' | 'cloudUpload' | 'compass' | 'database' | 'databaseSearch' | 'desktop' | 'devices' | 'external' | 'eye' | 'heartbeat' | 'layers' | 'lock' | 'messageQuestion' | 'mobile' | 'route' | 'shieldLock' | 'tablet' | 'userPlus' | 'users' | 'world';

const icons: Record<IconName, TablerIcon> = {
  activity: IconActivity,
  alert: IconAlertTriangle,
  article: IconArticle,
  calendar: IconCalendarEvent,
  chart: IconChartHistogram,
  chartLine: IconChartLine,
  check: IconCircleCheck,
  clock: IconClock,
  cloudUpload: IconCloudUpload,
  compass: IconCompass,
  database: IconDatabase,
  databaseSearch: IconDatabaseSearch,
  desktop: IconDeviceDesktop,
  devices: IconDevices,
  external: IconExternalLink,
  eye: IconEye,
  heartbeat: IconActivityHeartbeat,
  layers: IconStack2,
  lock: IconLock,
  messageQuestion: IconMessageQuestion,
  mobile: IconDeviceMobile,
  route: IconRoute,
  shieldLock: IconShieldLock,
  tablet: IconDeviceTablet,
  userPlus: IconUserPlus,
  users: IconUsers,
  world: IconWorld
};

export default function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const Component = icons[name];
  return <Component size={size} stroke={1.6} aria-hidden="true" focusable="false" />;
}
