import { expect, test, type APIRequestContext } from '@playwright/test';

const TEST_SETTINGS = {
  mansionName: 'SKC Mansion Auto Test',
  ownerName: 'SKC Owner Auto Test',
  ownerWhatsAppNumber: '+919999999999',
  caretakerName: 'Auto Caretaker',
};

const TEST_WORKERS = {
  attendanceWorker: {
    name: 'Auto Worker One',
    phone: '9999999999',
    attendanceDeviceUserId: 901,
    singleRoomDeviceUserId: 902,
    doubleRoomDeviceUserId: 903,
    monthlyRoomDeviceUserId: 904,
    familyRoomDeviceUserId: 905,
  },
  roomOnlyWorker: {
    name: 'Auto Room Manager',
    phone: '8888888888',
    singleRoomDeviceUserId: 912,
    doubleRoomDeviceUserId: 913,
    monthlyRoomDeviceUserId: 914,
    familyRoomDeviceUserId: 915,
  },
};

async function clearAlertHistory(request: APIRequestContext) {
  const response = await request.delete('/api/rental-alerts');
  expect(response.ok()).toBeTruthy();
}

async function clearTestWorkers(request: APIRequestContext) {
  const response = await request.get('/api/workers');
  expect(response.ok()).toBeTruthy();

  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('success' in body) || !(body as { success?: unknown }).success) {
    return;
  }

  const record = body as { data?: unknown };
  if (!Array.isArray(record.data)) {
    return;
  }

  for (const item of record.data) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }

    const worker = item as { id?: unknown; name?: unknown };
    if (
      typeof worker.id === 'string' &&
      (worker.name === TEST_WORKERS.attendanceWorker.name || worker.name === TEST_WORKERS.roomOnlyWorker.name)
    ) {
      const deleteResponse = await request.delete(`/api/workers/${worker.id}`);
      expect(deleteResponse.ok()).toBeTruthy();
    }
  }
}

async function clearTestData(request: APIRequestContext) {
  await clearAlertHistory(request);
  await clearTestWorkers(request);
}

async function ensureMockDeviceOnline(page: import('@playwright/test').Page) {
  const deviceStatus = page.getByTestId('device-status-label');
  if ((await deviceStatus.textContent())?.trim() === 'Mock Offline') {
    await page.getByRole('button', { name: 'Set Mock Online' }).click();
    await expect(deviceStatus).toHaveText('Mock Online');
  }
}

test.describe('Mansion rental alert flow', () => {
  test.beforeEach(async ({ request }) => {
    await clearTestData(request);
  });

  test.afterEach(async ({ request }) => {
    await clearTestData(request);
  });

  test('covers the full mansion flow', async ({ page, request }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Mansion Rental Alert System' }),
    ).toBeVisible();

    await page.goto('/login');
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel('Username').fill('wrong-user');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Invalid username or password')).toBeVisible();

    await page.getByLabel('Username').fill('skc');
    await page.getByLabel('Password').fill('skcmansion');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);

    await page.getByLabel('Mansion / PG Name').fill(TEST_SETTINGS.mansionName);
    await page.getByLabel('Owner Name').fill(TEST_SETTINGS.ownerName);
    await page.getByLabel('Owner WhatsApp Number').fill(TEST_SETTINGS.ownerWhatsAppNumber);
    await page.getByLabel('Caretaker Name').fill(TEST_SETTINGS.caretakerName);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Settings saved to database.')).toBeVisible();

    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings$/);

    const settingsResponse = await request.get('/api/settings');
    expect(settingsResponse.ok()).toBeTruthy();
    const settingsBody: unknown = await settingsResponse.json();
    expect(settingsBody).toMatchObject({
      success: true,
      data: {
        mansionName: TEST_SETTINGS.mansionName,
        ownerName: TEST_SETTINGS.ownerName,
        ownerWhatsAppNumber: TEST_SETTINGS.ownerWhatsAppNumber,
        caretakerName: TEST_SETTINGS.caretakerName,
      },
    });

    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: TEST_SETTINGS.mansionName })).toBeVisible();
    await expect(page.getByTestId('owner-whatsapp-label')).toHaveText(
      `Owner WhatsApp: ${TEST_SETTINGS.ownerWhatsAppNumber}`,
    );

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.getByRole('button', { name: 'Clear Database History' }).click();
    await expect(page.getByTestId('recent-alerts-empty')).toBeVisible();

    await page.getByRole('button', { name: 'Single Room Rented' }).click();
    await expect(page.getByTestId('total-alerts-count')).toHaveText('1');

    const singleRoomRow = page.locator('tbody tr').filter({ hasText: 'Single Room' });
    await expect(singleRoomRow).toBeVisible();
    await expect(singleRoomRow).toContainText('Single Room');
    await expect(singleRoomRow).toContainText('101');
    await expect(singleRoomRow).toContainText(TEST_SETTINGS.caretakerName);
    await expect(singleRoomRow).toContainText('Dashboard Button');
    await expect(singleRoomRow).toContainText('Mock Sent');

    await page.reload();
    await expect(page.getByTestId('total-alerts-count')).toHaveText('1');
    await expect(page.locator('tbody tr').filter({ hasText: 'Single Room' })).toBeVisible();

    await page.getByRole('button', { name: 'Single Room Rented' }).click();
    await expect(page.getByText('Duplicate ignored: same room type was already recorded within 30 seconds.')).toBeVisible();
    await expect(page.getByTestId('total-alerts-count')).toHaveText('1');

    await page.getByRole('button', { name: 'Set Mock Offline' }).click();
    await page.reload();
    await expect(page.getByTestId('device-status-label')).toHaveText('Mock Offline');

    await page.getByRole('button', { name: 'Simulate Device ID 102 Scan' }).click();
    await expect(page.getByText('Mock device is offline. Scan ignored.')).toBeVisible();
    await expect(page.getByTestId('total-alerts-count')).toHaveText('1');

    await page.getByRole('button', { name: 'Set Mock Online' }).click();
    await page.getByRole('button', { name: 'Manual Sync' }).click();
    await expect(page.getByTestId('last-sync-label')).not.toHaveText('Not synced yet');

    await page.getByRole('button', { name: 'Simulate Device ID 102 Scan' }).click();
    await expect(page.getByTestId('total-alerts-count')).toHaveText('2');

    const doubleRoomRow = page.locator('tbody tr').filter({ hasText: 'Double Room' });
    await expect(doubleRoomRow).toBeVisible();
    await expect(doubleRoomRow).toContainText('Double Room');
    await expect(doubleRoomRow).toContainText('102');
    await expect(doubleRoomRow).toContainText(TEST_SETTINGS.caretakerName);
    await expect(doubleRoomRow).toContainText('Mock Device Scan');

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.getByRole('button', { name: 'Clear Database History' }).click();
    await expect(page.getByTestId('total-alerts-count')).toHaveText('0');
    await expect(page.getByTestId('recent-alerts-empty')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('total-alerts-count')).toHaveText('0');
    await expect(page.getByTestId('recent-alerts-empty')).toBeVisible();

    await page.getByRole('link', { name: 'Workers' }).click();
    await expect(page).toHaveURL(/\/workers$/);

    await page.getByLabel('Person Name').fill(TEST_WORKERS.attendanceWorker.name);
    await page.getByLabel('Phone').fill(TEST_WORKERS.attendanceWorker.phone);
    await page.getByLabel('Attendance Device User ID').fill(String(TEST_WORKERS.attendanceWorker.attendanceDeviceUserId));
    await page.getByLabel('Single Room Device User ID').fill(String(TEST_WORKERS.attendanceWorker.singleRoomDeviceUserId));
    await page.getByLabel('Double Room Device User ID').fill(String(TEST_WORKERS.attendanceWorker.doubleRoomDeviceUserId));
    await page.getByLabel('Monthly Room Device User ID').fill(String(TEST_WORKERS.attendanceWorker.monthlyRoomDeviceUserId));
    await page.getByLabel('Family Room Device User ID').fill(String(TEST_WORKERS.attendanceWorker.familyRoomDeviceUserId));
    await page.getByRole('button', { name: 'Save Person' }).click();
    const attendanceWorkerRow = page.locator('tbody tr').filter({ hasText: TEST_WORKERS.attendanceWorker.name });
    await expect(attendanceWorkerRow).toBeVisible();
    await expect(attendanceWorkerRow).toContainText('Attendance + Room Rental');
    await expect(attendanceWorkerRow).toContainText('901');

    await page.getByRole('button', { name: 'Reset' }).click();
    await page.getByLabel('Person Name').fill(TEST_WORKERS.roomOnlyWorker.name);
    await page.getByLabel('Phone').fill(TEST_WORKERS.roomOnlyWorker.phone);
    await page.getByLabel('Person Type').selectOption('ROOM_ONLY');
    await page.getByLabel('Single Room Device User ID').fill(String(TEST_WORKERS.roomOnlyWorker.singleRoomDeviceUserId));
    await page.getByLabel('Double Room Device User ID').fill(String(TEST_WORKERS.roomOnlyWorker.doubleRoomDeviceUserId));
    await page.getByLabel('Monthly Room Device User ID').fill(String(TEST_WORKERS.roomOnlyWorker.monthlyRoomDeviceUserId));
    await page.getByLabel('Family Room Device User ID').fill(String(TEST_WORKERS.roomOnlyWorker.familyRoomDeviceUserId));
    await page.getByRole('button', { name: 'Save Person' }).click();
    const roomOnlyWorkerRow = page.locator('tbody tr').filter({ hasText: TEST_WORKERS.roomOnlyWorker.name });
    await expect(roomOnlyWorkerRow).toBeVisible();
    await expect(roomOnlyWorkerRow).toContainText('Room Rental Only');
    await expect(roomOnlyWorkerRow).toContainText('Not required');

    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await ensureMockDeviceOnline(page);

    await page.getByTestId('mapped-scan-input').fill(String(TEST_WORKERS.attendanceWorker.attendanceDeviceUserId));
    await page.getByTestId('mapped-scan-button').click();
    await expect(page.getByText(`Attendance marked: ${TEST_WORKERS.attendanceWorker.name} IN`)).toBeVisible();
    let attendanceRows = page.getByTestId('staff-attendance-table').locator('tbody tr').filter({
      hasText: TEST_WORKERS.attendanceWorker.name,
    });
    await expect(attendanceRows.first()).toContainText('IN');

    await page.getByTestId('mapped-scan-input').fill(String(TEST_WORKERS.attendanceWorker.attendanceDeviceUserId));
    await page.getByTestId('mapped-scan-button').click();
    await expect(page.getByText(`Attendance marked: ${TEST_WORKERS.attendanceWorker.name} OUT`)).toBeVisible();
    attendanceRows = page.getByTestId('staff-attendance-table').locator('tbody tr').filter({
      hasText: TEST_WORKERS.attendanceWorker.name,
    });
    await expect(attendanceRows.first()).toContainText('OUT');

    await page.getByTestId('mapped-scan-input').fill(String(TEST_WORKERS.attendanceWorker.singleRoomDeviceUserId));
    await page.getByTestId('mapped-scan-button').click();
    await expect(page.getByText(`Rental alert created: Single Room by ${TEST_WORKERS.attendanceWorker.name}`)).toBeVisible();
    await expect(page.getByTestId('total-alerts-count')).toHaveText('1');
    const singleMappedAlertResponse = await request.get('/api/rental-alerts');
    expect(singleMappedAlertResponse.ok()).toBeTruthy();
    const singleMappedAlertBody: unknown = await singleMappedAlertResponse.json();
    expect(singleMappedAlertBody).toMatchObject({ success: true });
    expect(
      Array.isArray((singleMappedAlertBody as { data?: unknown }).data),
    ).toBeTruthy();
    expect((singleMappedAlertBody as { data?: Array<{ roomType: string; deviceUserId: number; updatedBy: string }> }).data?.[0]).toMatchObject({
      roomType: 'Single Room',
      deviceUserId: TEST_WORKERS.attendanceWorker.singleRoomDeviceUserId,
      updatedBy: TEST_WORKERS.attendanceWorker.name,
    });

    await page.getByTestId('mapped-scan-input').fill(String(TEST_WORKERS.roomOnlyWorker.doubleRoomDeviceUserId));
    await page.getByTestId('mapped-scan-button').click();
    await expect(page.getByText(`Rental alert created: Double Room by ${TEST_WORKERS.roomOnlyWorker.name}`)).toBeVisible();
    await expect(page.getByTestId('total-alerts-count')).toHaveText('2');
    const doubleMappedAlertResponse = await request.get('/api/rental-alerts');
    expect(doubleMappedAlertResponse.ok()).toBeTruthy();
    const doubleMappedAlertBody: unknown = await doubleMappedAlertResponse.json();
    expect(doubleMappedAlertBody).toMatchObject({ success: true });
    expect(
      Array.isArray((doubleMappedAlertBody as { data?: unknown }).data),
    ).toBeTruthy();
    expect((doubleMappedAlertBody as { data?: Array<{ roomType: string; deviceUserId: number; updatedBy: string }> }).data?.[0]).toMatchObject({
      roomType: 'Double Room',
      deviceUserId: TEST_WORKERS.roomOnlyWorker.doubleRoomDeviceUserId,
      updatedBy: TEST_WORKERS.roomOnlyWorker.name,
    });

    await page.getByRole('button', { name: 'Set Mock Offline' }).click();
    await page.getByTestId('mapped-scan-input').fill(String(TEST_WORKERS.attendanceWorker.monthlyRoomDeviceUserId));
    await page.getByTestId('mapped-scan-button').click();
    await expect(page.getByText('Mock device is offline. Scan ignored.')).toBeVisible();
    await expect(page.getByTestId('total-alerts-count')).toHaveText('2');

    await clearAlertHistory(request);
    await clearTestWorkers(request);
    await page.reload();
    await expect(page.getByTestId('total-alerts-count')).toHaveText('0');
    await expect(page.getByTestId('recent-alerts-empty')).toBeVisible();
    await expect(page.getByTestId('attendance-empty')).toBeVisible();

    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });
});
