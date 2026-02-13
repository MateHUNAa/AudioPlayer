import { Platform, PermissionsAndroid, Permission } from 'react-native';

type PermissionStatus =
  | 'granted'
  | 'denied'
  | 'never_ask_again'
  | 'not_required';

interface PermissionResult {
  readonly status: PermissionStatus;
  readonly allGranted: boolean;
  readonly deniedPermissions: readonly string[];
}

const ApiLevel33 = 33 as const;

async function getDeviceApiLevel(): Promise<number> {
  if (Platform.OS !== 'android') {
    return 0;
  }
  return typeof Platform.Version === 'number'
    ? Platform.Version
    : parseInt(String(Platform.Version), 10);
}

function buildRequiredPermissions(apiLevel: number): Permission[] {
  if (apiLevel >= ApiLevel33) {
    return [PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO];
  }
  return [PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE];
}

/** @returns PermissionResult indicating whether all required storage permissions are already granted */
async function checkStoragePermissions(): Promise<PermissionResult> {
  if (Platform.OS !== 'android') {
    return { status: 'not_required', allGranted: true, deniedPermissions: [] };
  }

  const apiLevel = await getDeviceApiLevel();
  const required = buildRequiredPermissions(apiLevel);
  const denied: string[] = [];

  for (const permission of required) {
    const granted = await PermissionsAndroid.check(permission as Permission);
    if (!granted) {
      denied.push(permission);
    }
  }

  if (denied.length === 0) {
    return { status: 'granted', allGranted: true, deniedPermissions: [] };
  }

  return { status: 'denied', allGranted: false, deniedPermissions: denied };
}

/** @returns PermissionResult after prompting the user for required storage permissions */
async function requestStoragePermissions(): Promise<PermissionResult> {
  if (Platform.OS !== 'android') {
    return { status: 'not_required', allGranted: true, deniedPermissions: [] };
  }

  const apiLevel = await getDeviceApiLevel();
  const required = buildRequiredPermissions(apiLevel);

  const results = await PermissionsAndroid.requestMultiple(
    required as Permission[],
  );

  const denied: string[] = [];
  let hasNeverAskAgain = false;

  for (const permission of required) {
    const result = results[permission as keyof typeof results];
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      denied.push(permission);
      if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        hasNeverAskAgain = true;
      }
    }
  }

  if (denied.length === 0) {
    return { status: 'granted', allGranted: true, deniedPermissions: [] };
  }

  if (hasNeverAskAgain) {
    return {
      status: 'never_ask_again',
      allGranted: false,
      deniedPermissions: denied,
    };
  }

  return { status: 'denied', allGranted: false, deniedPermissions: denied };
}

/** @returns PermissionResult after ensuring permissions are granted, requesting if necessary */
async function ensureStoragePermissions(): Promise<PermissionResult> {
  const checkResult = await checkStoragePermissions();
  if (checkResult.allGranted) {
    return checkResult;
  }
  return requestStoragePermissions();
}

export const PermissionUtils = {
  checkStoragePermissions,
  requestStoragePermissions,
  ensureStoragePermissions,
} as const;

export type { PermissionStatus, PermissionResult };
