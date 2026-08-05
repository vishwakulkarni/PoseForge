import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './helpers/render';
import { charactersFixture, server } from './helpers/server';
import { CharactersView } from '@/app/characters/characters-view';
import { api } from '@/lib/api/client';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('CharactersView', () => {
  it('lists saved characters', async () => {
    renderWithProviders(<CharactersView />);

    expect(await screen.findByText('Anika')).toBeInTheDocument();
    expect(screen.getByText('Ravi')).toBeInTheDocument();
  });

  it('shows an empty state with a call to action when there are none', async () => {
    server.use(http.get('/api/characters', () => HttpResponse.json({ characters: [] })));

    renderWithProviders(<CharactersView />);

    expect(await screen.findByText(/no characters saved yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /add your first character/i }),
    ).toBeInTheDocument();
  });

  it('validates the add form before hitting the API', async () => {
    const user = userEvent.setup();
    let posted = false;
    server.use(
      http.post('/api/characters', () => {
        posted = true;
        return HttpResponse.json({ id: 'x', name: 'x', primaryPhotoUrl: '/x.png' });
      }),
    );

    renderWithProviders(<CharactersView />);
    await user.click(await screen.findByRole('button', { name: /add character/i }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /save character/i }));

    expect(await screen.findByText(/give this character a name/i)).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it('requires a photo even when a name is given', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CharactersView />);

    await user.click(await screen.findByRole('button', { name: /add character/i }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/name/i), 'Meera');
    await user.click(within(dialog).getByRole('button', { name: /save character/i }));

    expect(await screen.findByText(/add a reference photo/i)).toBeInTheDocument();
  });

  it('submits name and photo as multipart form data', async () => {
    const user = userEvent.setup();
    // A holder object: TS cannot track assignments made inside the MSW
    // callback, and would otherwise narrow these `let`s to `null`.
    const received: { name?: string; photo?: { size: number; type: string } } = {};

    // Inspect before fetch serialization. jsdom File and Node/Undici FormData
    // are different realms; asking MSW to reparse that multipart body tests
    // Undici internals rather than our component contract.
    vi.spyOn(api.characters, 'create').mockImplementation(async (form) => {
      received.name = form.get('name') as string;
      const photo = form.get('characterPhoto') as Blob | null;
      if (photo) received.photo = { size: photo.size, type: photo.type };
      return {
        id: 'new-id',
        name: received.name,
        primaryPhotoUrl: '/storage/new.png',
        createdAt: new Date().toISOString(),
      };
    });

    renderWithProviders(<CharactersView />);
    await user.click(await screen.findByRole('button', { name: /add character/i }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/name/i), 'Meera');
    await user.upload(
      within(dialog).getByLabelText(/character reference photo/i),
      new File(['bytes'], 'meera.png', { type: 'image/png' }),
    );

    await user.click(within(dialog).getByRole('button', { name: /save character/i }));

    await waitFor(() => expect(received.name).toBe('Meera'));
    expect(received.photo?.type).toBe('image/png');
    expect(received.photo?.size).toBeGreaterThan(0);
  });

  it('surfaces a duplicate-name conflict from the server', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/characters', () =>
        HttpResponse.json(
          { error: 'A character with that name already exists.' },
          { status: 409 },
        ),
      ),
    );

    renderWithProviders(<CharactersView />);
    await user.click(await screen.findByRole('button', { name: /add character/i }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText(/name/i), 'Anika');
    await user.upload(
      within(dialog).getByLabelText(/character reference photo/i),
      new File(['bytes'], 'a.png', { type: 'image/png' }),
    );
    await user.click(within(dialog).getByRole('button', { name: /save character/i }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });

  it('asks for confirmation before deleting and then calls the API', async () => {
    const user = userEvent.setup();
    let deletedId: string | null = null;

    server.use(
      http.delete('/api/characters/:id', ({ params }) => {
        deletedId = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<CharactersView />);
    await screen.findByText('Anika');

    await user.click(screen.getByRole('button', { name: /delete anika/i }));

    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent(/delete anika/i);
    // Nothing should have been sent just from opening the dialog.
    expect(deletedId).toBeNull();

    await user.click(within(confirm).getByRole('button', { name: /delete character/i }));

    await waitFor(() => expect(deletedId).toBe(charactersFixture[0].id));
  });

  it('shows a retryable error when the list fails to load', async () => {
    server.use(
      http.get('/api/characters', () =>
        HttpResponse.json({ error: 'Database unavailable.' }, { status: 500 }),
      ),
    );

    renderWithProviders(<CharactersView />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/database unavailable/i);
  });
});
