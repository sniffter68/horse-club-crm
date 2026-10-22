interface DimensionTokenDefinition {
  readonly name: string;
  readonly value: number;
  readonly scopes: readonly VariableScope[];
  readonly webSyntax: string;
}

interface ColorTokenDefinition {
  readonly name: string;
  readonly value: RGBA;
  readonly scopes: readonly VariableScope[];
  readonly webSyntax: string;
}

interface PermissionTokenDefinition {
  readonly name: string;
  readonly values: Readonly<Record<PermissionModeName, boolean>>;
}

interface TypographyStyleDefinition {
  readonly name: string;
  readonly fontFamily: string;
  readonly fontStyle: string;
  readonly fontSize: number;
  readonly lineHeight: LineHeight;
  readonly description: string;
}

interface CreationStatistics {
  collectionsCreated: number;
  variablesCreated: number;
  variablesUpdated: number;
  textStylesCreated: number;
  textStylesUpdated: number;
}

type PermissionModeName = "ADMIN" | "MANAGER" | "TRAINER";

const DIMENSIONS_COLLECTION_NAME = "Dimensions";
const COLORS_COLLECTION_NAME = "Colors";
const PERMISSIONS_COLLECTION_NAME = "Permissions";
const DEFAULT_MODE_NAME = "Value";

const statistics: CreationStatistics = {
  collectionsCreated: 0,
  variablesCreated: 0,
  variablesUpdated: 0,
  textStylesCreated: 0,
  textStylesUpdated: 0,
};

function rgbaFromHex(hex: string): RGBA {
  const normalizedHex = hex.replace("#", "");

  if (!/^[0-9A-Fa-f]{6}$/.test(normalizedHex)) {
    throw new Error(`Invalid HEX color: ${hex}`);
  }

  return {
    r: Number.parseInt(normalizedHex.slice(0, 2), 16) / 255,
    g: Number.parseInt(normalizedHex.slice(2, 4), 16) / 255,
    b: Number.parseInt(normalizedHex.slice(4, 6), 16) / 255,
    a: 1,
  };
}

const dimensionTokens: readonly DimensionTokenDefinition[] = [
  { name: "spacing/xs", value: 8, scopes: ["GAP"], webSyntax: "var(--spacing-xs)" },
  { name: "spacing/sm", value: 16, scopes: ["GAP"], webSyntax: "var(--spacing-sm)" },
  { name: "spacing/md", value: 24, scopes: ["GAP"], webSyntax: "var(--spacing-md)" },
  { name: "spacing/lg", value: 32, scopes: ["GAP"], webSyntax: "var(--spacing-lg)" },
  { name: "spacing/xl", value: 40, scopes: ["GAP"], webSyntax: "var(--spacing-xl)" },
  { name: "radius/sm", value: 4, scopes: ["CORNER_RADIUS"], webSyntax: "var(--radius-sm)" },
  { name: "radius/base", value: 8, scopes: ["CORNER_RADIUS"], webSyntax: "var(--radius-base)" },
];

const colorScopes: readonly VariableScope[] = [
  "FRAME_FILL",
  "SHAPE_FILL",
  "TEXT_FILL",
  "STROKE_COLOR",
];

const colorTokens: readonly ColorTokenDefinition[] = [
  { name: "status/scheduled", value: rgbaFromHex("#1677FF"), scopes: colorScopes, webSyntax: "var(--status-scheduled)" },
  { name: "status/completed", value: rgbaFromHex("#52C41A"), scopes: colorScopes, webSyntax: "var(--status-completed)" },
  { name: "status/no-show", value: rgbaFromHex("#FA541C"), scopes: colorScopes, webSyntax: "var(--status-no-show)" },
  { name: "status/cancelled", value: rgbaFromHex("#8C8C8C"), scopes: colorScopes, webSyntax: "var(--status-cancelled)" },
  { name: "tag/rider", value: rgbaFromHex("#1677FF"), scopes: colorScopes, webSyntax: "var(--tag-rider)" },
  { name: "tag/payer", value: rgbaFromHex("#52C41A"), scopes: colorScopes, webSyntax: "var(--tag-payer)" },
  { name: "tag/horse-available", value: rgbaFromHex("#52C41A"), scopes: colorScopes, webSyntax: "var(--tag-horse-available)" },
  { name: "tag/horse-unavailable", value: rgbaFromHex("#FF4D4F"), scopes: colorScopes, webSyntax: "var(--tag-horse-unavailable)" },
  { name: "badge/debt", value: rgbaFromHex("#FAAD14"), scopes: colorScopes, webSyntax: "var(--badge-debt)" },
  { name: "badge/no-membership", value: rgbaFromHex("#FF4D4F"), scopes: colorScopes, webSyntax: "var(--badge-no-membership)" },
];

const permissionTokens: readonly PermissionTokenDefinition[] = [
  { name: "showMedicalNotes", values: { ADMIN: true, MANAGER: true, TRAINER: false } },
  { name: "showBaseRate", values: { ADMIN: true, MANAGER: true, TRAINER: false } },
  { name: "showServicePrice", values: { ADMIN: true, MANAGER: true, TRAINER: false } },
];

const typographyDefinitions: readonly TypographyStyleDefinition[] = [
  {
    name: "Heading/Page",
    fontFamily: "Inter",
    fontStyle: "Semi Bold",
    fontSize: 20,
    lineHeight: { unit: "PIXELS", value: 28 },
    description: "Page heading for CRM screens.",
  },
  {
    name: "Heading/Card",
    fontFamily: "Inter",
    fontStyle: "Medium",
    fontSize: 16,
    lineHeight: { unit: "PIXELS", value: 24 },
    description: "Heading for cards, panels and modal sections.",
  },
  {
    name: "Body/Regular",
    fontFamily: "Inter",
    fontStyle: "Regular",
    fontSize: 14,
    lineHeight: { unit: "PIXELS", value: 22 },
    description: "Default Ant Design CRM body text.",
  },
  {
    name: "Caption/Small",
    fontFamily: "Inter",
    fontStyle: "Regular",
    fontSize: 12,
    lineHeight: { unit: "PIXELS", value: 20 },
    description: "Captions, hints, metadata and helper text.",
  },
];

function findCollection(
  collections: readonly VariableCollection[],
  name: string,
): VariableCollection | undefined {
  return collections.find(
    (collection: VariableCollection): boolean => collection.name === name,
  );
}

function getOrCreateCollection(
  collections: VariableCollection[],
  name: string,
): VariableCollection {
  const existingCollection = findCollection(collections, name);

  if (existingCollection !== undefined) {
    return existingCollection;
  }

  const collection = figma.variables.createVariableCollection(name);
  collections.push(collection);
  statistics.collectionsCreated += 1;

  return collection;
}

function ensureSingleMode(
  collection: VariableCollection,
  expectedName: string,
): string {
  const existingMode = collection.modes.find(
    (mode): boolean => mode.name === expectedName,
  );

  if (existingMode !== undefined) {
    return existingMode.modeId;
  }

  if (collection.modes.length === 1) {
    const defaultModeId = collection.modes[0].modeId;
    collection.renameMode(defaultModeId, expectedName);
    return defaultModeId;
  }

  return collection.addMode(expectedName);
}

function ensurePermissionModes(
  collection: VariableCollection,
): Readonly<Record<PermissionModeName, string>> {
  const requiredModes: readonly PermissionModeName[] = [
    "ADMIN",
    "MANAGER",
    "TRAINER",
  ];

  const result: Partial<Record<PermissionModeName, string>> = {};

  for (const modeName of requiredModes) {
    const existingMode = collection.modes.find(
      (mode): boolean => mode.name === modeName,
    );

    if (existingMode !== undefined) {
      result[modeName] = existingMode.modeId;
      continue;
    }

    if (
      modeName === "ADMIN" &&
      collection.modes.length === 1 &&
      collection.modes[0].name !== "MANAGER" &&
      collection.modes[0].name !== "TRAINER"
    ) {
      const defaultModeId = collection.modes[0].modeId;
      collection.renameMode(defaultModeId, "ADMIN");
      result.ADMIN = defaultModeId;
      continue;
    }

    result[modeName] = collection.addMode(modeName);
  }

  if (
    result.ADMIN === undefined ||
    result.MANAGER === undefined ||
    result.TRAINER === undefined
  ) {
    throw new Error("Could not create all Permissions modes.");
  }

  return {
    ADMIN: result.ADMIN,
    MANAGER: result.MANAGER,
    TRAINER: result.TRAINER,
  };
}

function createVariableLookup(
  variables: readonly Variable[],
): Map<string, Variable> {
  const lookup = new Map<string, Variable>();

  for (const variable of variables) {
    const key = `${variable.variableCollectionId}:${variable.name}`;
    lookup.set(key, variable);
  }

  return lookup;
}

function getVariableKey(
  collection: VariableCollection,
  variableName: string,
): string {
  return `${collection.id}:${variableName}`;
}

function ensureVariable(
  lookup: Map<string, Variable>,
  collection: VariableCollection,
  name: string,
  resolvedType: VariableResolvedDataType,
): Variable {
  const key = getVariableKey(collection, name);
  const existingVariable = lookup.get(key);

  if (existingVariable !== undefined) {
    if (existingVariable.resolvedType !== resolvedType) {
      throw new Error(
        `Variable "${name}" has type "${existingVariable.resolvedType}", but "${resolvedType}" is required.`,
      );
    }
    statistics.variablesUpdated += 1;
    return existingVariable;
  }

  const variable = figma.variables.createVariable(
    name,
    collection,
    resolvedType,
  );

  lookup.set(key, variable);
  statistics.variablesCreated += 1;

  return variable;
}

function createDimensionVariables(
  lookup: Map<string, Variable>,
  collection: VariableCollection,
  modeId: string,
): void {
  for (const token of dimensionTokens) {
    const variable = ensureVariable(lookup, collection, token.name, "FLOAT");
    variable.scopes = [...token.scopes];
    variable.setValueForMode(modeId, token.value);
    variable.setVariableCodeSyntax("WEB", token.webSyntax);
  }
}

function createColorVariables(
  lookup: Map<string, Variable>,
  collection: VariableCollection,
  modeId: string,
): void {
  for (const token of colorTokens) {
    const variable = ensureVariable(lookup, collection, token.name, "COLOR");
    variable.scopes = [...token.scopes];
    variable.setValueForMode(modeId, token.value);
    variable.setVariableCodeSyntax("WEB", token.webSyntax);
  }
}

function createPermissionVariables(
  lookup: Map<string, Variable>,
  collection: VariableCollection,
  modeIds: Readonly<Record<PermissionModeName, string>>,
): void {
  for (const token of permissionTokens) {
    const variable = ensureVariable(lookup, collection, token.name, "BOOLEAN");
    variable.scopes = [];
    variable.setValueForMode(modeIds.ADMIN, token.values.ADMIN);
    variable.setValueForMode(modeIds.MANAGER, token.values.MANAGER);
    variable.setValueForMode(modeIds.TRAINER, token.values.TRAINER);
  }
}

function resolveFontName(
  availableFonts: readonly Font[],
  family: string,
  style: string,
): FontName {
  const matchingFont = availableFonts.find(
    (font: Font): boolean =>
      font.fontName.family === family && font.fontName.style === style,
  );

  if (matchingFont === undefined) {
    const availableStyles = availableFonts
      .filter((font: Font): boolean => font.fontName.family === family)
      .map((font: Font): string => font.fontName.style)
      .join(", ");

    throw new Error(
      `Font "${family} ${style}" is unavailable. Available: ${availableStyles || "none"}.`,
    );
  }

  return matchingFont.fontName;
}

async function preloadFonts(
  definitions: readonly TypographyStyleDefinition[],
): Promise<Map<string, FontName>> {
  const availableFonts = await figma.listAvailableFontsAsync();
  const fontsByKey = new Map<string, FontName>();

  for (const definition of definitions) {
    const key = `${definition.fontFamily}:${definition.fontStyle}`;

    if (fontsByKey.has(key)) {
      continue;
    }

    fontsByKey.set(
      key,
      resolveFontName(
        availableFonts,
        definition.fontFamily,
        definition.fontStyle,
      ),
    );
  }

  await Promise.all(
    Array.from(fontsByKey.values()).map(
      async (fontName: FontName): Promise<void> => {
        await figma.loadFontAsync(fontName);
      },
    ),
  );

  return fontsByKey;
}

async function createTypographyStyles(
  fontsByKey: ReadonlyMap<string, FontName>,
): Promise<void> {
  const existingStyles = await figma.getLocalTextStylesAsync();
  const stylesByName = new Map<string, TextStyle>(
    existingStyles.map(
      (style: TextStyle): readonly [string, TextStyle] => [style.name, style],
    ),
  );

  for (const definition of typographyDefinitions) {
    const fontKey = `${definition.fontFamily}:${definition.fontStyle}`;
    const fontName = fontsByKey.get(fontKey);

    if (fontName === undefined) {
      throw new Error(`Preloaded font not found: ${fontKey}.`);
    }

    let textStyle = stylesByName.get(definition.name);

    if (textStyle === undefined) {
      textStyle = figma.createTextStyle();
      textStyle.name = definition.name;
      stylesByName.set(definition.name, textStyle);
      statistics.textStylesCreated += 1;
    } else {
      statistics.textStylesUpdated += 1;
    }

    textStyle.fontName = fontName;
    textStyle.fontSize = definition.fontSize;
    textStyle.lineHeight = definition.lineHeight;
    textStyle.letterSpacing = { unit: "PERCENT", value: 0 };
    textStyle.description = definition.description;
  }
}

async function run(): Promise<void> {
  if (figma.editorType !== "figma") {
    throw new Error("Horse Club OS Foundations can only run in a Figma Design file.");
  }

  const [collections, existingVariables, fontsByKey] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync(),
    preloadFonts(typographyDefinitions),
  ]);

  const mutableCollections: VariableCollection[] = [...collections];
  const variableLookup = createVariableLookup(existingVariables);

  const dimensionsCollection = getOrCreateCollection(mutableCollections, DIMENSIONS_COLLECTION_NAME);
  const dimensionsModeId = ensureSingleMode(dimensionsCollection, DEFAULT_MODE_NAME);
  createDimensionVariables(variableLookup, dimensionsCollection, dimensionsModeId);

  const colorsCollection = getOrCreateCollection(mutableCollections, COLORS_COLLECTION_NAME);
  const colorsModeId = ensureSingleMode(colorsCollection, DEFAULT_MODE_NAME);
  createColorVariables(variableLookup, colorsCollection, colorsModeId);

  const permissionsCollection = getOrCreateCollection(mutableCollections, PERMISSIONS_COLLECTION_NAME);
  const permissionModeIds = ensurePermissionModes(permissionsCollection);
  createPermissionVariables(variableLookup, permissionsCollection, permissionModeIds);

  await createTypographyStyles(fontsByKey);

  figma.commitUndo();
  figma.notify(
    `Horse Club OS Foundations готовы. Коллекций: ${statistics.collectionsCreated}, переменных: ${statistics.variablesCreated}, стилей: ${statistics.textStylesCreated}.`,
    { timeout: 5000 },
  );
  figma.closePlugin();
}

void run().catch((error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  figma.notify(`Ошибка Foundations: ${message}`, { error: true, timeout: 10000 });
  figma.closePlugin();
});
