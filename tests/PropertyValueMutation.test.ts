import {
  displayPropertyValue,
  EMPTY_PROPERTY_VALUE,
  indexPropertyValue,
  replaceIndexedPropertyValue,
} from "../src/PropertyValueMutation";
import { setLanguage } from "../src/I18n";

expectEqual(indexPropertyValue([]), [EMPTY_PROPERTY_VALUE]);
expectEqual(indexPropertyValue(["active", "done", "active"]), ["active", "done"]);

expectEqual(replaceIndexedPropertyValue("active", "active", "done"), {
  changed: true,
  value: "done",
});
expectEqual(replaceIndexedPropertyValue(1, "1", "2"), {
  changed: true,
  value: 2,
});
expectEqual(replaceIndexedPropertyValue(true, "true", "false"), {
  changed: true,
  value: false,
});
expectEqual(
  replaceIndexedPropertyValue(["active", "later"], "active", "done"),
  { changed: true, value: ["done", "later"] },
);
expectEqual(
  replaceIndexedPropertyValue(["active", "done"], "active", "done"),
  { changed: true, value: ["done"] },
);
expectEqual(replaceIndexedPropertyValue([], EMPTY_PROPERTY_VALUE, "planned"), {
  changed: true,
  value: ["planned"],
});
expectEqual(replaceIndexedPropertyValue("done", "active", "planned"), {
  changed: false,
  value: "done",
});
expectThrows(
  () => replaceIndexedPropertyValue(1, "1", "not-a-number"),
  /有效数字/,
);
expectThrows(
  () => replaceIndexedPropertyValue(true, "true", "yes"),
  /true 或 false/,
);
expectEqual(
  replaceIndexedPropertyValue({ stage: "active" }, '{"stage":"active"}', '{"stage":"done"}'),
  { changed: true, value: { stage: "done" } },
);
expectEqual(displayPropertyValue(EMPTY_PROPERTY_VALUE), "（空值）");

setLanguage("en");
expectEqual(displayPropertyValue(EMPTY_PROPERTY_VALUE), "(empty)");
expectThrows(
  () => replaceIndexedPropertyValue(1, "1", "not-a-number"),
  /valid number/,
);
setLanguage("zh-CN");

function expectEqual(actual: unknown, expected: unknown): void {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`Expected ${expectedText}, received ${actualText}.`);
  }
}

function expectThrows(run: () => unknown, pattern: RegExp): void {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (pattern.test(message)) return;
    throw new Error(`Expected error ${pattern}, received ${message}.`);
  }
  throw new Error(`Expected error ${pattern}, but no error was thrown.`);
}
