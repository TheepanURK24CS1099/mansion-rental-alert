import { expect, test, type APIRequestContext } from '@playwright/test';

const TEST_SETTINGS = {
  mansionName: 'SKC Mansion Auto Test',
  ownerName: 'SKC Owner Auto Test',
  ownerWhatsAppNumber: '+919999999999',
  caretakerName: 'Auto Caretaker',
};

async function clearAlertHistory(request: APIRequestContext) {
  const response = await request.delete('/api/rental-alerts');
  expect(response.ok()).toBeTruthy();
}

test.describe('Mansion rental alert flow', () => {
  test.beforeEach(async ({ request }) => {
    await clearAlertHistory(request);
  });

  test.afterEach(async ({ request }) => {
    await clearAlertHistory(request);
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

    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });
});
