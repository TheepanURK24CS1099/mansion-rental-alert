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

async function clearMessageLogs(request: APIRequestContext) {
  const response = await request.delete('/api/message-logs');
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
  await clearMessageLogs(request);
  await clearTestWorkers(request);
}

async function ensureDeveloperTestingToolsExpanded(page: import('@playwright/test').Page) {
  const mappedScanButton = page.getByTestId('mapped-scan-button');
  if (!(await mappedScanButton.isVisible())) {
    await page.locator('summary', { hasText: 'Developer Testing Tools' }).click();
  }
}

async function ensureMockDeviceOnline(page: import('@playwright/test').Page) {
  await ensureDeveloperTestingToolsExpanded(page);
  const deviceStatus = page.getByTestId('device-status-label');
  if ((await deviceStatus.textContent())?.trim() === 'Mock Offline') {
    await page.getByRole('button', { name: 'Set Mock Online' }).click();
    await expect(deviceStatus).toHaveText('Mock Online');
  }
}

async function ensureMockDeviceOffline(page: import('@playwright/test').Page) {
  await ensureDeveloperTestingToolsExpanded(page);
  const deviceStatus = page.getByTestId('device-status-label');
  if ((await deviceStatus.textContent())?.trim() === 'Mock Online') {
    await page.getByRole('button', { name: 'Set Mock Offline' }).click();
    await expect(deviceStatus).toHaveText('Mock Offline');
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
    await page.getByRole('button', { name: 'Save Owner Settings' }).click();
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

    await ensureDeveloperTestingToolsExpanded(page);
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

    await ensureDeveloperTestingToolsExpanded(page);
    await page.getByRole('button', { name: 'Single Room Rented' }).click();
    await expect(page.getByText('Duplicate ignored: same room type was already recorded within 30 seconds.')).toBeVisible();
    await expect(page.getByTestId('total-alerts-count')).toHaveText('1');

    await ensureMockDeviceOffline(page);
    await page.reload();
    await expect(page.getByTestId('device-status-label')).toHaveText('Mock Offline');

    await ensureDeveloperTestingToolsExpanded(page);
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

    await expect(page.getByTestId('message-logs-subtitle')).toContainText(
      'No real WhatsApp is sent in this version.',
    );

    await ensureDeveloperTestingToolsExpanded(page);
    await ensureMockDeviceOnline(page);

    await page.getByTestId('mapped-scan-input').fill(String(TEST_WORKERS.attendanceWorker.attendanceDeviceUserId));
    await page.getByTestId('mapped-scan-button').click();
    await expect(page.getByText(`Attendance marked: ${TEST_WORKERS.attendanceWorker.name} IN`)).toBeVisible();
    let attendanceRows = page.getByTestId('staff-attendance-table').locator('tbody tr').filter({
      hasText: TEST_WORKERS.attendanceWorker.name,
    });
    await expect(attendanceRows.first()).toContainText('IN');

    const messageLogRowsAfterAttendance = page
      .getByTestId('message-logs-table')
      .locator('tbody tr')
      .filter({ hasText: 'STAFF_ATTENDANCE' });
    await expect(messageLogRowsAfterAttendance.first()).toContainText('mansion_staff_attendance_alert');
    await expect(messageLogRowsAfterAttendance.first()).toContainText('MOCK_SENT');
    await expect(messageLogRowsAfterAttendance.first()).toContainText('MOCK');

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
    expect(
      JSON.stringify(singleMappedAlertBody),
    ).toContain(String(TEST_WORKERS.attendanceWorker.singleRoomDeviceUserId));

    const messageLogRowsAfterRental = page
      .getByTestId('message-logs-table')
      .locator('tbody tr')
      .filter({ hasText: 'RENTAL_ALERT' });
    await expect(messageLogRowsAfterRental.first()).toContainText(TEST_SETTINGS.ownerWhatsAppNumber);
    await expect(messageLogRowsAfterRental.first()).toContainText('mansion_rental_alert');
    await expect(messageLogRowsAfterRental.first()).toContainText('MOCK_SENT');
    await expect(messageLogRowsAfterRental.first()).toContainText('MOCK');

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
    expect(
      JSON.stringify(doubleMappedAlertBody),
    ).toContain(String(TEST_WORKERS.roomOnlyWorker.doubleRoomDeviceUserId));

    await ensureMockDeviceOffline(page);
    await page.getByTestId('mapped-scan-input').fill(String(TEST_WORKERS.attendanceWorker.monthlyRoomDeviceUserId));
    await page.getByTestId('mapped-scan-button').click();
    await expect(page.getByText('Mock device is offline. Scan ignored.')).toBeVisible();
    await expect(page.getByTestId('total-alerts-count')).toHaveText('2');

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.getByRole('button', { name: 'Clear Message Logs' }).click();
    await expect(page.getByTestId('message-logs-count')).toHaveText('0');
    await expect(page.getByTestId('message-logs-empty')).toBeVisible();

    await expect(page.getByTestId('total-alerts-count')).toHaveText('2');
    await expect(page.getByTestId('staff-attendance-table').locator('tbody tr').first()).toContainText(
      TEST_WORKERS.attendanceWorker.name,
    );

    await clearAlertHistory(request);
    await clearTestWorkers(request);
    await page.reload();
    await expect(page.getByTestId('total-alerts-count')).toHaveText('0');
    await expect(page.getByTestId('recent-alerts-empty')).toBeVisible();

    const attendanceCleanupResponse = await request.get('/api/worker-attendance');
    expect(attendanceCleanupResponse.ok()).toBeTruthy();
    const attendanceCleanupBody: unknown = await attendanceCleanupResponse.json();
    expect(attendanceCleanupBody).toMatchObject({ success: true });
    expect(
      (attendanceCleanupBody as {
        data?: Array<{ worker?: { name?: string } }>;
      }).data?.some(
        (log) =>
          log.worker?.name === TEST_WORKERS.attendanceWorker.name ||
          log.worker?.name === TEST_WORKERS.roomOnlyWorker.name,
      ),
    ).toBeFalsy();

    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('saves biometric device settings', async ({ page, request }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('skc');
    await page.getByLabel('Password').fill('skcmansion');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);

    // Verify Biometric Device Settings section exists
    await expect(page.getByRole('heading', { name: 'Biometric Device Settings' })).toBeVisible();

    // Set Device Mode to MOCK
    await page.locator('select').first().selectOption('MOCK');

    // Set Device Model
    await page.getByPlaceholder('e.g., ZKTeco MB360').fill('Future Biometric Device');

    // Set Device Port
    await page.locator('input[type="number"]').fill('4370');

    // Set Device Location
    await page.getByPlaceholder('e.g., SKC Mansion Reception').fill('SKC Mansion Reception');

    // Ensure Real Device is disabled (keep checkbox unchecked)
    const realDeviceCheckbox = page.getByLabel('Enable Real Device');
    const isChecked = await realDeviceCheckbox.isChecked();
    if (isChecked) {
      await realDeviceCheckbox.click();
    }

    // Click Save button
    const saveButton = page.getByRole('button', { name: 'Save Device Settings' });
    await saveButton.scrollIntoViewIfNeeded();
    
    // Listen for any error messages
    const errorElements = page.getByText(/Failed to save device settings|Device IP is required/);
    
    await saveButton.click();

    // Wait for response
    await page.waitForTimeout(1500);
    
    // Check if there's an error message displayed
    const errorCount = await errorElements.count();
    if (errorCount > 0) {
      const errorText = await errorElements.first().textContent();
      throw new Error(`Device settings save failed with error: ${errorText}`);
    }

    // Verify settings persist via API
    const deviceStateResponse = await request.get('/api/device-state');
    expect(deviceStateResponse.ok()).toBeTruthy();
    const deviceStateBody: unknown = await deviceStateResponse.json();
    
    expect(deviceStateBody).toMatchObject({
      success: true,
      data: {
        deviceMode: 'MOCK',
        deviceModel: 'Future Biometric Device',
        devicePort: 4370,
        deviceLocation: 'SKC Mansion Reception',
        realDeviceEnabled: false,
      },
    });
  });
});
