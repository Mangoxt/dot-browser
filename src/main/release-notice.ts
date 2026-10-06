import releases from '../shared/releases.json';
import type { Storage } from './storage';

function newer(current: string, previous: string) {
  const a = current.split('.').map(Number);
  const b = previous.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

export function releaseInfo(
  storage: Storage,
  version: string,
  automatic: boolean,
  privateMode: boolean,
) {
  const available = releases.filter((r) => r.version === version || newer(version, r.version));
  const seen = storage.data.lastSeenReleaseVersion;
  let show = false;
  if (automatic && !privateMode && available.some((r) => r.version === version)) {
    if (!storage.data.settings.onboarded && !seen) {
      storage.data.lastSeenReleaseVersion = version;
      storage.flush();
    } else if ((!seen || newer(version, seen)) && !storage.releaseNoticeClaimed) {
      storage.releaseNoticeClaimed = true;
      show = true;
    }
  }
  return {
    version,
    show,
    releases: automatic && seen ? available.filter((r) => newer(r.version, seen)) : available,
  };
}

export function markReleaseSeen(storage: Storage, version: string, privateMode: boolean) {
  if (privateMode) return;
  if (!storage.data.lastSeenReleaseVersion || newer(version, storage.data.lastSeenReleaseVersion)) {
    storage.data.lastSeenReleaseVersion = version;
    storage.flush();
  }
}
