// Selector de contactos del teléfono (Contact Picker API). Hoy solo existe en Chrome para Android.

interface ContactoElegido {
  nombre: string;
  telefono: string;
}

type ContactsManager = {
  select(props: ('name' | 'tel')[], opts?: { multiple?: boolean }): Promise<{ name?: string[]; tel?: string[] }[]>;
};

export const puedeElegirContacto = (): boolean =>
  typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;

/** Abre la libreta de contactos. Devuelve null si el usuario cancela o no se puede. */
export async function elegirContacto(): Promise<ContactoElegido | null> {
  if (!puedeElegirContacto()) return null;
  try {
    const [c] = await (navigator as Navigator & { contacts: ContactsManager }).contacts.select(['name', 'tel'], { multiple: false });
    if (!c) return null;
    return { nombre: (c.name?.[0] ?? '').trim(), telefono: (c.tel?.[0] ?? '').trim() };
  } catch {
    return null;
  }
}
