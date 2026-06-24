export type TranslationTable = Readonly<Record<string, string>>;

export class Localization {
  private static tables = new Map<string, TranslationTable>();
  private static currentLocale = 'en';
  private static fallbackLocale = 'en';
  private static revisionValue = 0;

  static get locale(): string {
    return this.currentLocale;
  }

  static get revision(): number {
    return this.revisionValue;
  }

  static add(locale: string, translations: TranslationTable): void {
    this.tables.set(locale, translations);
    this.revisionValue++;
  }

  static use(locale: string, fallback = this.fallbackLocale): void {
    if (this.currentLocale === locale && this.fallbackLocale === fallback) return;
    this.currentLocale = locale;
    this.fallbackLocale = fallback;
    this.revisionValue++;
  }

  static translate(
    key: string,
    values: Readonly<Record<string, string | number>> = {},
  ): string {
    const template = this.tables.get(this.currentLocale)?.[key]
      ?? this.tables.get(this.fallbackLocale)?.[key]
      ?? key;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      values[name] === undefined ? match : String(values[name])
    );
  }
}
