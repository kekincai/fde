import type { ReactNode } from 'react';

export type IconName = 'bookmark' | 'external' | 'search' | 'user' | 'close' | 'menu' | 'chevron' | 'logout' | 'devices' | 'home' | 'map' | 'compass' | 'radar' | 'chart' | 'target' | 'cycle' | 'document' | 'inbox' | 'layers' | 'check';

export default function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true
  };
  const paths: Record<IconName, ReactNode> = {
    bookmark: <path d="M6.5 4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5V21l-5.5-3-5.5 3V4.5Z" />,
    external: <><path d="M14 5h5v5" /><path d="M19 5 11 13" /><path d="M18 13v4.5A1.5 1.5 0 0 1 16.5 19h-9A1.5 1.5 0 0 1 6 17.5v-9A1.5 1.5 0 0 1 7.5 7H12" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5" /></>,
    user: <><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    chevron: <path d="m9 6 6 6-6 6" />,
    logout: <><path d="M10 5H6v14h4M14 8l4 4-4 4M9 12h9" /></>,
    devices: <><rect x="3" y="5" width="14" height="10" rx="1.5" /><path d="M8 19h4M10 15v4M19 9h2v10h-6v-2" /></>,
    home: <><path d="m4 11 8-7 8 7" /><path d="M6.5 10v10h11V10M10 20v-6h4v6" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" /><path d="M9 3v15M15 6v15" /></>,
    compass: <><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z" /></>,
    radar: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12 18.5 6M12 3.5v2M20.5 12h-2" /><circle cx="17" cy="8" r="1" fill="currentColor" stroke="none" /></>,
    chart: <><path d="M4 19V5M4 19h16" /><path d="m7 15 3-4 3 2 5-6" /><circle cx="7" cy="15" r=".8" fill="currentColor" stroke="none" /><circle cx="18" cy="7" r=".8" fill="currentColor" stroke="none" /></>,
    target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    cycle: <><path d="M19 8a7.5 7.5 0 0 0-12.5-2L4 8.5" /><path d="M4 4v4.5h4.5M5 16a7.5 7.5 0 0 0 12.5 2l2.5-2.5" /><path d="M20 20v-4.5h-4.5" /></>,
    document: <><path d="M6 3.5h8l4 4V20H6Z" /><path d="M14 3.5V8h4M9 12h6M9 15.5h6" /></>,
    inbox: <><path d="M4 5h16v13H4Z" /><path d="m4 13 4-3h8l4 3M8 13l1.5 2h5L16 13" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m4 12 8 4.5 8-4.5M4 16l8 4.5 8-4.5" /></>,
    check: <><circle cx="12" cy="12" r="8.5" /><path d="m8 12 2.7 2.7L16.5 9" /></>
  };
  return <svg {...props}>{paths[name]}</svg>;
}
