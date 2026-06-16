var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/config.ts
var TIMEOUT_CONFIG = {
  geocoding: 1e4,
  // 10 seconds for geocoding requests
  lookup: 5e3,
  // 5 seconds for riding lookup
  batch: 3e4,
  // 30 seconds for batch processing
  total: 6e4,
  // 60 seconds maximum total request time
  webhook: 3e4
  // 30 seconds for webhook delivery
};
var RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 1e3,
  // 1 second base delay
  maxDelay: 5e3,
  // 5 seconds maximum delay
  backoffMultiplier: 2,
  // Exponential backoff multiplier
  jitter: true
  // Add random jitter to prevent thundering herd
};
function getTimeoutConfig(env) {
  return {
    geocoding: env.BATCH_TIMEOUT || TIMEOUT_CONFIG.geocoding,
    lookup: env.BATCH_TIMEOUT || TIMEOUT_CONFIG.lookup,
    batch: env.BATCH_TIMEOUT || TIMEOUT_CONFIG.batch,
    total: env.BATCH_TIMEOUT || TIMEOUT_CONFIG.total,
    webhook: TIMEOUT_CONFIG.webhook
  };
}
__name(getTimeoutConfig, "getTimeoutConfig");
function getRetryConfig() {
  return RETRY_CONFIG;
}
__name(getRetryConfig, "getRetryConfig");
var TIME_CONSTANTS = {
  ONE_HOUR_MS: 60 * 60 * 1e3,
  SIX_HOURS_MS: 6 * 60 * 60 * 1e3,
  TWENTY_FOUR_HOURS_MS: 24 * 60 * 60 * 1e3,
  SEVEN_DAYS_MS: 7 * 24 * 60 * 60 * 1e3
};
var TIME_CONSTANTS_SECONDS = {
  TWENTY_FOUR_HOURS: 24 * 60 * 60
};
var QUALITY_THRESHOLDS = {
  GEOGRATIS_MIN_SCORE: 0.5
  // Minimum acceptable GeoGratis quality score (0-1 scale)
};

// node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  __name(assertIs, "assertIs");
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  __name(assertNever, "assertNever");
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  __name(joinValues, "joinValues");
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = /* @__PURE__ */ __name((data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
}, "getParsedType");

// node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = /* @__PURE__ */ __name((obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
}, "quotelessJson");
var ZodError = class _ZodError extends Error {
  static {
    __name(this, "ZodError");
  }
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = /* @__PURE__ */ __name((error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    }, "processError");
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// node_modules/zod/v3/locales/en.js
var errorMap = /* @__PURE__ */ __name((issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
}, "errorMap");
var en_default = errorMap;

// node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
__name(setErrorMap, "setErrorMap");
function getErrorMap() {
  return overrideErrorMap;
}
__name(getErrorMap, "getErrorMap");

// node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = /* @__PURE__ */ __name((params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
}, "makeIssue");
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
__name(addIssueToContext, "addIssueToContext");
var ParseStatus = class _ParseStatus {
  static {
    __name(this, "ParseStatus");
  }
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = /* @__PURE__ */ __name((value) => ({ status: "dirty", value }), "DIRTY");
var OK = /* @__PURE__ */ __name((value) => ({ status: "valid", value }), "OK");
var isAborted = /* @__PURE__ */ __name((x) => x.status === "aborted", "isAborted");
var isDirty = /* @__PURE__ */ __name((x) => x.status === "dirty", "isDirty");
var isValid = /* @__PURE__ */ __name((x) => x.status === "valid", "isValid");
var isAsync = /* @__PURE__ */ __name((x) => typeof Promise !== "undefined" && x instanceof Promise, "isAsync");

// node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  static {
    __name(this, "ParseInputLazyPath");
  }
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = /* @__PURE__ */ __name((ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
}, "handleResult");
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = /* @__PURE__ */ __name((iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  }, "customMap");
  return { errorMap: customMap, description };
}
__name(processCreateParams, "processCreateParams");
var ZodType = class {
  static {
    __name(this, "ZodType");
  }
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = /* @__PURE__ */ __name((val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    }, "getIssueProperties");
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = /* @__PURE__ */ __name(() => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      }), "setError");
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: /* @__PURE__ */ __name((data) => this["~validate"](data), "validate")
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
__name(timeRegexSource, "timeRegexSource");
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
__name(timeRegex, "timeRegex");
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
__name(datetimeRegex, "datetimeRegex");
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
__name(isValidIP, "isValidIP");
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
__name(isValidJWT, "isValidJWT");
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
__name(isValidCidr, "isValidCidr");
var ZodString = class _ZodString extends ZodType {
  static {
    __name(this, "ZodString");
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
__name(floatSafeRemainder, "floatSafeRemainder");
var ZodNumber = class _ZodNumber extends ZodType {
  static {
    __name(this, "ZodNumber");
  }
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  static {
    __name(this, "ZodBigInt");
  }
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  static {
    __name(this, "ZodBoolean");
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  static {
    __name(this, "ZodDate");
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  static {
    __name(this, "ZodSymbol");
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  static {
    __name(this, "ZodUndefined");
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  static {
    __name(this, "ZodNull");
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  static {
    __name(this, "ZodAny");
  }
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  static {
    __name(this, "ZodUnknown");
  }
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  static {
    __name(this, "ZodNever");
  }
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  static {
    __name(this, "ZodVoid");
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  static {
    __name(this, "ZodArray");
  }
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: /* @__PURE__ */ __name(() => newShape, "shape")
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
__name(deepPartialify, "deepPartialify");
var ZodObject = class _ZodObject extends ZodType {
  static {
    __name(this, "ZodObject");
  }
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: /* @__PURE__ */ __name((issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }, "errorMap")
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: /* @__PURE__ */ __name(() => ({
        ...this._def.shape(),
        ...augmentation
      }), "shape")
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: /* @__PURE__ */ __name(() => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }), "shape"),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: /* @__PURE__ */ __name(() => shape, "shape")
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: /* @__PURE__ */ __name(() => shape, "shape")
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: /* @__PURE__ */ __name(() => newShape, "shape")
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: /* @__PURE__ */ __name(() => newShape, "shape")
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: /* @__PURE__ */ __name(() => shape, "shape"),
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: /* @__PURE__ */ __name(() => shape, "shape"),
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  static {
    __name(this, "ZodUnion");
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    __name(handleResults, "handleResults");
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = /* @__PURE__ */ __name((type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
}, "getDiscriminator");
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  static {
    __name(this, "ZodDiscriminatedUnion");
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
__name(mergeValues, "mergeValues");
var ZodIntersection = class extends ZodType {
  static {
    __name(this, "ZodIntersection");
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = /* @__PURE__ */ __name((parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    }, "handleParsed");
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  static {
    __name(this, "ZodTuple");
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  static {
    __name(this, "ZodRecord");
  }
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  static {
    __name(this, "ZodMap");
  }
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  static {
    __name(this, "ZodSet");
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    __name(finalizeSet, "finalizeSet");
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  static {
    __name(this, "ZodFunction");
  }
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    __name(makeArgsIssue, "makeArgsIssue");
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    __name(makeReturnsIssue, "makeReturnsIssue");
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  static {
    __name(this, "ZodLazy");
  }
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  static {
    __name(this, "ZodLiteral");
  }
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
__name(createZodEnum, "createZodEnum");
var ZodEnum = class _ZodEnum extends ZodType {
  static {
    __name(this, "ZodEnum");
  }
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  static {
    __name(this, "ZodNativeEnum");
  }
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  static {
    __name(this, "ZodPromise");
  }
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  static {
    __name(this, "ZodEffects");
  }
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: /* @__PURE__ */ __name((arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      }, "addIssue"),
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = /* @__PURE__ */ __name((acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      }, "executeRefinement");
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  static {
    __name(this, "ZodOptional");
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  static {
    __name(this, "ZodNullable");
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  static {
    __name(this, "ZodDefault");
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  static {
    __name(this, "ZodCatch");
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  static {
    __name(this, "ZodNaN");
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  static {
    __name(this, "ZodBranded");
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  static {
    __name(this, "ZodPipeline");
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = /* @__PURE__ */ __name(async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      }, "handleAsync");
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  static {
    __name(this, "ZodReadonly");
  }
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = /* @__PURE__ */ __name((data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    }, "freeze");
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
__name(cleanParams, "cleanParams");
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
__name(custom, "custom");
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = /* @__PURE__ */ __name((cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params), "instanceOfType");
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = /* @__PURE__ */ __name(() => stringType().optional(), "ostring");
var onumber = /* @__PURE__ */ __name(() => numberType().optional(), "onumber");
var oboolean = /* @__PURE__ */ __name(() => booleanType().optional(), "oboolean");
var coerce = {
  string: /* @__PURE__ */ __name(((arg) => ZodString.create({ ...arg, coerce: true })), "string"),
  number: /* @__PURE__ */ __name(((arg) => ZodNumber.create({ ...arg, coerce: true })), "number"),
  boolean: /* @__PURE__ */ __name(((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })), "boolean"),
  bigint: /* @__PURE__ */ __name(((arg) => ZodBigInt.create({ ...arg, coerce: true })), "bigint"),
  date: /* @__PURE__ */ __name(((arg) => ZodDate.create({ ...arg, coerce: true })), "date")
};
var NEVER = INVALID;

// src/validation.ts
var GeoGratisGeometrySchema = external_exports.object({
  type: external_exports.string(),
  coordinates: external_exports.array(external_exports.number())
});
var GeoGratisResultSchema = external_exports.object({
  title: external_exports.string().optional(),
  qualifier: external_exports.string().optional(),
  type: external_exports.string().optional(),
  geometry: GeoGratisGeometrySchema,
  bbox: external_exports.array(external_exports.number()).optional(),
  score: external_exports.number().min(0).max(1).optional(),
  component: external_exports.record(external_exports.any()).optional()
});
var GeoGratisResponseSchema = external_exports.array(GeoGratisResultSchema);
var GoogleLocationSchema = external_exports.object({
  lat: external_exports.number(),
  lng: external_exports.number()
});
var GoogleGeometrySchema = external_exports.object({
  location: GoogleLocationSchema,
  location_type: external_exports.string().optional(),
  viewport: external_exports.object({
    northeast: GoogleLocationSchema,
    southwest: GoogleLocationSchema
  }).optional()
});
var GoogleGeocodeResultSchema = external_exports.object({
  address_components: external_exports.array(external_exports.any()).optional(),
  formatted_address: external_exports.string().optional(),
  geometry: GoogleGeometrySchema,
  place_id: external_exports.string().optional(),
  types: external_exports.array(external_exports.string()).optional()
});
var GoogleGeocodeResponseSchema = external_exports.object({
  results: external_exports.array(GoogleGeocodeResultSchema),
  status: external_exports.enum(["OK", "ZERO_RESULTS", "OVER_QUERY_LIMIT", "REQUEST_DENIED", "INVALID_REQUEST", "UNKNOWN_ERROR"])
});
var GoogleBatchGeocodeResultItemSchema = external_exports.object({
  address: external_exports.string(),
  geocoded_address: external_exports.string().optional(),
  partial_match: external_exports.boolean().optional(),
  place_id: external_exports.string().optional(),
  postcode_localities: external_exports.array(external_exports.string()).optional(),
  types: external_exports.array(external_exports.string()).optional(),
  geometry: external_exports.object({
    location: external_exports.object({
      lat: external_exports.number(),
      lng: external_exports.number()
    }),
    location_type: external_exports.string().optional(),
    viewport: external_exports.object({
      northeast: external_exports.object({ lat: external_exports.number(), lng: external_exports.number() }),
      southwest: external_exports.object({ lat: external_exports.number(), lng: external_exports.number() })
    }).optional()
  })
});
var GoogleBatchGeocodeResponseSchema = external_exports.object({
  results: external_exports.array(GoogleBatchGeocodeResultItemSchema)
});
var NominatimResultSchema = external_exports.object({
  place_id: external_exports.number().optional(),
  licence: external_exports.string().optional(),
  osm_type: external_exports.string().optional(),
  osm_id: external_exports.number().optional(),
  boundingbox: external_exports.array(external_exports.string()).optional(),
  lat: external_exports.string(),
  lon: external_exports.string(),
  display_name: external_exports.string().optional(),
  class: external_exports.string().optional(),
  type: external_exports.string().optional(),
  importance: external_exports.number().optional(),
  icon: external_exports.string().optional()
});
var NominatimResponseSchema = external_exports.array(NominatimResultSchema);
var MapboxFeatureSchema = external_exports.object({
  id: external_exports.string().optional(),
  type: external_exports.string(),
  place_type: external_exports.array(external_exports.string()).optional(),
  relevance: external_exports.number().optional(),
  properties: external_exports.record(external_exports.any()).optional(),
  text: external_exports.string().optional(),
  place_name: external_exports.string().optional(),
  center: external_exports.tuple([external_exports.number(), external_exports.number()]),
  geometry: external_exports.any().optional()
});
var MapboxResponseSchema = external_exports.object({
  type: external_exports.literal("FeatureCollection"),
  query: external_exports.array(external_exports.any()).optional(),
  features: external_exports.array(MapboxFeatureSchema),
  attribution: external_exports.string().optional()
});
function safeValidateGeoGratis(data) {
  return safeValidate(GeoGratisResponseSchema, data);
}
__name(safeValidateGeoGratis, "safeValidateGeoGratis");
function safeValidateGoogleGeocode(data) {
  return safeValidate(GoogleGeocodeResponseSchema, data);
}
__name(safeValidateGoogleGeocode, "safeValidateGoogleGeocode");
function safeValidateGoogleBatchGeocode(data) {
  return safeValidate(GoogleBatchGeocodeResponseSchema, data);
}
__name(safeValidateGoogleBatchGeocode, "safeValidateGoogleBatchGeocode");
function safeValidateNominatim(data) {
  return safeValidate(NominatimResponseSchema, data);
}
__name(safeValidateNominatim, "safeValidateNominatim");
function safeValidate(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error };
  }
}
__name(safeValidate, "safeValidate");

// src/geocoding.ts
var BATCH_GEOCODING_CONFIG = {
  ENABLED: true,
  MAX_BATCH_SIZE: 10,
  PROVIDER: "individual"
  // 'individual' = GeoGratis-first; 'google' = batch Google (optional fallback)
};
var GEOGRATIS_MIN_SCORE = QUALITY_THRESHOLDS.GEOGRATIS_MIN_SCORE;
function generateGeocodingCacheKey(query, provider) {
  const normalizedQuery = {
    address: query.address?.toLowerCase().trim(),
    postal: query.postal?.toLowerCase().trim().replace(/\s+/g, ""),
    city: query.city?.toLowerCase().trim(),
    state: query.state?.toLowerCase().trim(),
    country: query.country?.toLowerCase().trim()
  };
  return `geocoding:${provider}:${JSON.stringify(normalizedQuery)}`;
}
__name(generateGeocodingCacheKey, "generateGeocodingCacheKey");
async function getCachedGeocoding(env, cacheKey) {
  if (!env.GEOCODING_CACHE) return null;
  try {
    const cached = await env.GEOCODING_CACHE.get(cacheKey, "json");
    if (!cached) return null;
    const maxAge = TIME_CONSTANTS.TWENTY_FOUR_HOURS_MS;
    if (Date.now() - cached.timestamp > maxAge) {
      await env.GEOCODING_CACHE.delete(cacheKey);
      return null;
    }
    return {
      lon: cached.lon,
      lat: cached.lat,
      qualifier: cached.qualifier,
      score: cached.score
    };
  } catch (error) {
    console.warn("Failed to get cached geocoding result:", error);
    return null;
  }
}
__name(getCachedGeocoding, "getCachedGeocoding");
async function setCachedGeocoding(env, cacheKey, lon, lat, provider, qualifier, score) {
  if (!env.GEOCODING_CACHE) return;
  try {
    const entry = {
      lon,
      lat,
      timestamp: Date.now(),
      provider,
      qualifier,
      score
    };
    await env.GEOCODING_CACHE.put(cacheKey, JSON.stringify(entry), {
      expirationTtl: TIME_CONSTANTS_SECONDS.TWENTY_FOUR_HOURS
    });
  } catch (error) {
    console.warn("Failed to cache geocoding result:", error);
  }
}
__name(setCachedGeocoding, "setCachedGeocoding");
var NonRetriableError = class extends Error {
  static {
    __name(this, "NonRetriableError");
  }
  nonRetriable;
  constructor(message) {
    super(message);
    this.nonRetriable = true;
  }
};
async function withRetry(fn, config, operation) {
  let lastError;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) {
      }
      return result;
    } catch (error) {
      lastError = error;
      if (lastError?.nonRetriable) {
        console.error(`[GEOCODING] ${operation} failed with non-retriable error:`, lastError.message);
        throw lastError;
      }
      if (attempt === config.maxAttempts) {
        console.error(`[GEOCODING] ${operation} failed after ${config.maxAttempts} attempts:`, lastError.message);
        throw lastError;
      }
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      );
      const jitteredDelay = delay + Math.random() * 1e3;
      console.warn(`[GEOCODING] ${operation} attempt ${attempt} failed, retrying in ${Math.round(jitteredDelay)}ms:`, lastError.message);
      await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
    }
  }
  throw lastError;
}
__name(withRetry, "withRetry");
async function withTimeout(promise, timeoutMs, operation) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}
__name(withTimeout, "withTimeout");
async function normalizeAddressWithGoogle(env, lat, lon, request, circuitBreaker) {
  const headerKey = request?.headers.get("X-Google-API-Key");
  const key = headerKey || env.GOOGLE_MAPS_KEY;
  if (!key) return null;
  const doReverse = /* @__PURE__ */ __name(async () => {
    const params = new URLSearchParams({
      latlng: `${lat},${lon}`,
      key,
      region: "ca"
    });
    const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
    const resp = await fetch(url, { headers: { "User-Agent": "riding-lookup/1.0" } });
    if (!resp.ok) return null;
    const rawData = await resp.json();
    const validation = safeValidateGoogleGeocode(rawData);
    if (!validation.success) return null;
    const data = validation.data;
    if (data.status !== "OK" || !data.results?.length) return null;
    const addr = data.results[0].formatted_address;
    return typeof addr === "string" && addr.length > 0 ? addr : null;
  }, "doReverse");
  try {
    const timeoutConfig = getTimeoutConfig(env);
    const timeoutMs = Math.min(timeoutConfig.geocoding, 5e3);
    const fn = /* @__PURE__ */ __name(() => withTimeout(doReverse(), timeoutMs, "Google reverse geocode"), "fn");
    const out = circuitBreaker ? await circuitBreaker.execute("geocoding:google-reverse", fn) : await fn();
    return out;
  } catch {
    return null;
  }
}
__name(normalizeAddressWithGoogle, "normalizeAddressWithGoogle");
async function geocodeWithGeoGratis(qp) {
  try {
    const queryParts = [];
    if (qp.address) queryParts.push(qp.address);
    if (qp.postal) queryParts.push(qp.postal);
    if (qp.city) queryParts.push(qp.city);
    if (qp.state) queryParts.push(qp.state);
    if (qp.country) queryParts.push(qp.country);
    if (queryParts.length === 0) {
      const query = qp.address || qp.postal || qp.city || qp.state || qp.country;
      if (!query) return null;
      queryParts.push(query);
    }
    const queryString = queryParts.join(", ");
    const params = new URLSearchParams({
      q: queryString,
      expand: "score,component"
      // Request score and component for quality assessment
    });
    const url = `https://geogratis.gc.ca/services/geolocation/en/locate?${params.toString()}`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "riding-lookup/1.0" }
    });
    if (!resp.ok) {
      console.warn(`[GEOCODING] GeoGratis API error: ${resp.status}`);
      return null;
    }
    const rawData = await resp.json();
    const validation = safeValidateGeoGratis(rawData);
    if (!validation.success) {
      console.warn(`[GEOCODING] GeoGratis response validation failed:`, validation.error.errors);
      return null;
    }
    const data = validation.data;
    if (data.length === 0) {
      console.warn(`[GEOCODING] GeoGratis returned no results`);
      return null;
    }
    const firstResult = data[0];
    if (!firstResult.geometry || !firstResult.geometry.coordinates || firstResult.geometry.coordinates.length < 2) {
      console.warn(`[GEOCODING] GeoGratis result missing valid coordinates`);
      return null;
    }
    const lon = firstResult.geometry.coordinates[0];
    const lat = firstResult.geometry.coordinates[1];
    if (typeof lon !== "number" || typeof lat !== "number" || isNaN(lon) || isNaN(lat)) {
      console.warn(`[GEOCODING] GeoGratis result has invalid coordinates`);
      return null;
    }
    return {
      lon,
      lat,
      qualifier: firstResult.qualifier,
      score: firstResult.score
    };
  } catch (error) {
    console.warn(`[GEOCODING] GeoGratis geocoding failed:`, error instanceof Error ? error.message : "Unknown error");
    return null;
  }
}
__name(geocodeWithGeoGratis, "geocodeWithGeoGratis");
async function geocodeIfNeeded(env, qp, request, metrics2, circuitBreaker) {
  if (typeof qp.lat === "number" && typeof qp.lon === "number") {
    return { lon: qp.lon, lat: qp.lat };
  }
  const query = qp.address || qp.postal || qp.city || qp.state || qp.country;
  if (!query) throw new Error("Missing location: provide lat/lon or address/postal");
  const timeoutConfig = getTimeoutConfig(env);
  const timeoutMs = timeoutConfig.geocoding;
  const geocodePromise = (async () => {
    const startTime = Date.now();
    metrics2?.incrementMetric("geocodingRequests");
    const geogratisCacheKey = generateGeocodingCacheKey(qp, "geogratis");
    const geogratisCached = await getCachedGeocoding(env, geogratisCacheKey);
    if (geogratisCached) {
      const isInterpolated = geogratisCached.qualifier === "INTERPOLATED_POSITION";
      const hasPoorScore = geogratisCached.score !== void 0 && geogratisCached.score < GEOGRATIS_MIN_SCORE;
      if (!isInterpolated && !hasPoorScore) {
        metrics2?.incrementMetric("geocodingCacheHits");
        metrics2?.recordTiming("totalGeocodingTime", Date.now() - startTime);
        return { lon: geogratisCached.lon, lat: geogratisCached.lat };
      } else {
        console.warn(`[GEOCODING] Cached GeoGratis result was ${isInterpolated ? "interpolated" : "poor quality"}, fetching fresh result`);
      }
    }
    try {
      const geogratisResult = await geocodeWithGeoGratis(qp);
      if (geogratisResult) {
        const isInterpolated = geogratisResult.qualifier === "INTERPOLATED_POSITION";
        const hasPoorScore = geogratisResult.score !== void 0 && geogratisResult.score < GEOGRATIS_MIN_SCORE;
        if (isInterpolated) {
          console.warn(`[GEOCODING] GeoGratis returned INTERPOLATED_POSITION, falling back to ${env.GEOCODER || "nominatim"}`);
        } else if (hasPoorScore) {
          console.warn(`[GEOCODING] GeoGratis returned poor score (${geogratisResult.score}), falling back to ${env.GEOCODER || "nominatim"}`);
        } else {
          await setCachedGeocoding(env, geogratisCacheKey, geogratisResult.lon, geogratisResult.lat, "geogratis", geogratisResult.qualifier, geogratisResult.score);
          metrics2?.incrementMetric("geocodingSuccesses");
          metrics2?.recordTiming("totalGeocodingTime", Date.now() - startTime);
          return { lon: geogratisResult.lon, lat: geogratisResult.lat };
        }
      } else {
        console.warn(`[GEOCODING] GeoGratis failed, falling back to ${env.GEOCODER || "nominatim"}`);
      }
    } catch (error) {
      console.warn(`[GEOCODING] GeoGratis error, falling back to ${env.GEOCODER || "nominatim"}:`, error instanceof Error ? error.message : "Unknown error");
    }
    const provider = (env.GEOCODER || "nominatim").toLowerCase();
    const cacheKey = generateGeocodingCacheKey(qp, provider);
    const cached = await getCachedGeocoding(env, cacheKey);
    if (cached) {
      metrics2?.incrementMetric("geocodingCacheHits");
      metrics2?.recordTiming("totalGeocodingTime", Date.now() - startTime);
      return { lon: cached.lon, lat: cached.lat };
    }
    metrics2?.incrementMetric("geocodingCacheMisses");
    let result;
    try {
      const geocodeFn = /* @__PURE__ */ __name(async () => {
        let geocodeResult;
        if (provider === "google") {
          const headerKey = request?.headers.get("X-Google-API-Key");
          const key = headerKey || env.GOOGLE_MAPS_KEY;
          if (!key) throw new Error("Google API key not provided. Set X-Google-API-Key header or configure GOOGLE_MAPS_KEY environment variable");
          const params = new URLSearchParams({ key });
          const components = [];
          if (qp.postal) components.push(`postal_code:${qp.postal.replace(/\s+/g, "")}`);
          if (qp.city) components.push(`locality:${qp.city}`);
          if (qp.state) components.push(`administrative_area:${qp.state}`);
          const country = (qp.country || "CA").toUpperCase();
          components.push(`country:${country}`);
          if (components.length) params.set("components", components.join("|"));
          if (qp.address) params.set("address", qp.address);
          params.set("region", "ca");
          const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
          const resp = await fetch(url, { headers: { "User-Agent": "riding-lookup/1.0" } });
          if (!resp.ok) throw new Error(`Google error: ${resp.status}`);
          const rawData = await resp.json();
          const validation = safeValidateGoogleGeocode(rawData);
          if (!validation.success) {
            console.warn(`[GEOCODING] Google response validation failed:`, validation.error.errors);
            throw new Error(`Google API response validation failed`);
          }
          const data = validation.data;
          if (data.status === "ZERO_RESULTS" || data.status === "REQUEST_DENIED" || data.status === "INVALID_REQUEST" || !data.results?.length) {
            console.error(`[GEOCODING] Google API failed (${data.status || "no results"}), falling back to Nominatim`);
            const nominatimParams = new URLSearchParams({ format: "jsonv2", limit: "1", country: "canada" });
            if (qp.address) nominatimParams.set("street", qp.address);
            if (qp.city) nominatimParams.set("city", qp.city);
            if (qp.state) nominatimParams.set("state", qp.state);
            if (qp.country) nominatimParams.set("country", qp.country);
            if (qp.postal) nominatimParams.set("postalcode", qp.postal);
            if (![qp.address, qp.city, qp.state, qp.country, qp.postal].some(Boolean)) {
              nominatimParams.set("q", query);
            }
            const nominatimUrl = `https://nominatim.openstreetmap.org/search?${nominatimParams.toString()}`;
            const nomResp = await fetch(nominatimUrl, { headers: { "User-Agent": "riding-lookup/1.0" } });
            if (nomResp.ok) {
              const rawResults = await nomResp.json();
              const nomValidation = safeValidateNominatim(rawResults);
              if (!nomValidation.success) {
                console.warn(`[GEOCODING] Nominatim response validation failed:`, nomValidation.error.errors);
                throw new Error(`Nominatim API response validation failed`);
              }
              const results = nomValidation.data;
              const first = results?.[0];
              if (first) {
                geocodeResult = { lon: Number(first.lon), lat: Number(first.lat) };
                return geocodeResult;
              }
            }
            console.error(`[GEOCODING] Nominatim fallback also failed, no results found`);
            throw new NonRetriableError("No results from Google");
          }
          if (data.status === "OVER_QUERY_LIMIT" || data.status === "UNKNOWN_ERROR") {
            throw new Error(`Google API error: ${data.status}`);
          }
          const loc = data.results[0].geometry.location;
          const fmt = data.results[0].formatted_address;
          geocodeResult = {
            lon: loc.lng,
            lat: loc.lat,
            ...typeof fmt === "string" && fmt.length > 0 && { normalizedAddress: fmt }
          };
        } else if (provider === "mapbox") {
          const token = env.MAPBOX_TOKEN;
          if (!token) throw new Error("MAPBOX_TOKEN not configured");
          const resp = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=1&proximity=ca&access_token=${token}`, {
            headers: { "User-Agent": "riding-lookup/1.0" }
          });
          if (!resp.ok) throw new Error(`Mapbox error: ${resp.status}`);
          const data = await resp.json();
          const feat = data?.features?.[0];
          if (!feat?.center) throw new Error("No results from Mapbox");
          geocodeResult = { lon: feat.center[0], lat: feat.center[1] };
        } else {
          const nominatimParams = new URLSearchParams({ format: "jsonv2", limit: "1", country: "canada" });
          if (qp.address) nominatimParams.set("street", qp.address);
          if (qp.city) nominatimParams.set("city", qp.city);
          if (qp.state) nominatimParams.set("state", qp.state);
          if (qp.country) nominatimParams.set("country", qp.country);
          if (qp.postal) nominatimParams.set("postalcode", qp.postal);
          if (![qp.address, qp.city, qp.state, qp.country, qp.postal].some(Boolean)) {
            nominatimParams.set("q", query);
          }
          const nominatimUrl = `https://nominatim.openstreetmap.org/search?${nominatimParams.toString()}`;
          const resp = await fetch(nominatimUrl, { headers: { "User-Agent": "riding-lookup/1.0" } });
          if (!resp.ok) throw new Error(`Nominatim error: ${resp.status}`);
          const rawResults = await resp.json();
          const nomValidation = safeValidateNominatim(rawResults);
          if (!nomValidation.success) {
            console.warn(`[GEOCODING] Nominatim response validation failed:`, nomValidation.error.errors);
            throw new Error(`Nominatim API response validation failed`);
          }
          const results = nomValidation.data;
          const first = results?.[0];
          if (!first) throw new Error("No results from Nominatim");
          geocodeResult = { lon: Number(first.lon), lat: Number(first.lat) };
        }
        return geocodeResult;
      }, "geocodeFn");
      const retryConfig = getRetryConfig();
      if (circuitBreaker) {
        result = await circuitBreaker.execute(`geocoding:${provider}`, async () => {
          return await withRetry(geocodeFn, retryConfig, `Geocoding ${provider}`);
        });
      } else {
        result = await withRetry(geocodeFn, retryConfig, `Geocoding ${provider}`);
      }
      metrics2?.incrementMetric("geocodingSuccesses");
    } catch (error) {
      console.error(`[GEOCODING] Geocoding failed after ${Date.now() - startTime}ms:`, error instanceof Error ? error.message : "Unknown error");
      metrics2?.incrementMetric("geocodingFailures");
      if (error instanceof Error && error.message.includes("Circuit breaker is OPEN")) {
        console.error(`[GEOCODING] Circuit breaker is OPEN for provider: ${provider}`);
        metrics2?.incrementMetric("geocodingCircuitBreakerTrips");
      }
      throw error;
    }
    await setCachedGeocoding(env, cacheKey, result.lon, result.lat, provider);
    metrics2?.recordTiming("totalGeocodingTime", Date.now() - startTime);
    return result;
  })();
  return withTimeout(geocodePromise, timeoutMs, "Geocoding");
}
__name(geocodeIfNeeded, "geocodeIfNeeded");
async function geocodeBatchWithGoogle(env, queries, apiKey) {
  const results = [];
  const errors = [];
  const addresses = queries.map((query) => {
    const addressParts = [];
    if (query.address) addressParts.push(query.address);
    if (query.postal) addressParts.push(query.postal);
    if (query.city) addressParts.push(query.city);
    if (query.state) addressParts.push(query.state);
    if (query.country) addressParts.push(query.country);
    return {
      address: addressParts.join(", ")
    };
  });
  const batchRequest = {
    addresses
  };
  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "riding-lookup/1.0"
      },
      body: JSON.stringify(batchRequest)
    });
    if (!response.ok) {
      const errorMsg = `Google batch geocoding HTTP error: ${response.status}`;
      errors.push(errorMsg);
      for (let i = 0; i < queries.length; i++) {
        results.push({ lon: 0, lat: 0, success: false, error: errorMsg });
      }
      return results;
    }
    const rawData = await response.json();
    const validation = safeValidateGoogleBatchGeocode(rawData);
    if (!validation.success) {
      const errorMsg = `Google batch geocoding validation failed: ${validation.error.errors.map((e) => e.message).join(", ")}`;
      console.warn(`[GEOCODING] ${errorMsg}`);
      errors.push(errorMsg);
      for (let i = 0; i < queries.length; i++) {
        results.push({ lon: 0, lat: 0, success: false, error: errorMsg });
      }
      return results;
    }
    const data = validation.data;
    if (data.results && data.results.length === queries.length) {
      let successCount = 0;
      let failureCount = 0;
      for (let i = 0; i < data.results.length; i++) {
        const result = data.results[i];
        const query = queries[i];
        if (result.geometry?.location) {
          results.push({
            lon: result.geometry.location.lng,
            lat: result.geometry.location.lat,
            success: true
          });
          successCount++;
        } else {
          const errorMsg = `No results for query: ${query.address || query.postal || query.city || "unknown"}`;
          results.push({
            lon: 0,
            lat: 0,
            success: false,
            error: errorMsg
          });
          errors.push(`Query ${i}: ${errorMsg}`);
          failureCount++;
        }
      }
      if (failureCount > 0) {
        console.warn(`Batch geocoding: ${successCount} succeeded, ${failureCount} failed out of ${queries.length} total`);
      }
    } else {
      const errorMsg = `Batch response mismatch: expected ${queries.length} results, got ${data.results?.length || 0}`;
      errors.push(errorMsg);
      console.warn(errorMsg + ", falling back to individual geocoding");
      for (let i = 0; i < queries.length; i++) {
        const query = queries[i];
        try {
          const result = await geocodeIfNeeded(env, query);
          results.push({ ...result, success: true });
        } catch (error) {
          const errorMsg2 = error instanceof Error ? error.message : "Geocoding failed";
          results.push({
            lon: 0,
            lat: 0,
            success: false,
            error: errorMsg2
          });
          errors.push(`Query ${i}: ${errorMsg2}`);
        }
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("Google batch geocoding failed:", errorMsg);
    errors.push(`Batch API error: ${errorMsg}`);
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      try {
        const result = await geocodeIfNeeded(env, query);
        results.push({ ...result, success: true });
      } catch (individualError) {
        const errorMsg2 = individualError instanceof Error ? individualError.message : "Geocoding failed";
        results.push({
          lon: 0,
          lat: 0,
          success: false,
          error: errorMsg2
        });
        errors.push(`Query ${i}: ${errorMsg2}`);
      }
    }
  }
  if (errors.length > 0) {
    console.warn(`Batch geocoding errors (${errors.length}):`, errors.slice(0, 5));
  }
  return results;
}
__name(geocodeBatchWithGoogle, "geocodeBatchWithGoogle");
async function geocodeBatch(env, queries, request, metrics2, circuitBreaker) {
  if (!BATCH_GEOCODING_CONFIG.ENABLED || queries.length === 0) {
    return [];
  }
  const results = [];
  const batchSize = BATCH_GEOCODING_CONFIG.MAX_BATCH_SIZE;
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    try {
      if (BATCH_GEOCODING_CONFIG.PROVIDER === "google" && env.GOOGLE_MAPS_KEY) {
        const batchResults = await geocodeBatchWithGoogle(env, batch, env.GOOGLE_MAPS_KEY);
        results.push(...batchResults);
      } else {
        for (const query of batch) {
          try {
            const result = await geocodeIfNeeded(env, query, request, metrics2, circuitBreaker);
            results.push({ lon: result.lon, lat: result.lat, success: true, normalizedAddress: result.normalizedAddress });
          } catch (error) {
            results.push({
              lon: 0,
              lat: 0,
              success: false,
              error: error instanceof Error ? error.message : "Geocoding failed"
            });
          }
        }
      }
    } catch (error) {
      console.error(`Batch geocoding failed for batch ${i / BATCH_GEOCODING_CONFIG.MAX_BATCH_SIZE + 1}:`, error);
      for (const query of batch) {
        try {
          const result = await geocodeIfNeeded(env, query, request, metrics2, circuitBreaker);
          results.push({ lon: result.lon, lat: result.lat, success: true, normalizedAddress: result.normalizedAddress });
        } catch (individualError) {
          results.push({
            lon: 0,
            lat: 0,
            success: false,
            error: individualError instanceof Error ? individualError.message : "Geocoding failed"
          });
        }
      }
    }
  }
  return results;
}
__name(geocodeBatch, "geocodeBatch");

// src/circuit-breaker.ts
var CircuitBreaker = class {
  static {
    __name(this, "CircuitBreaker");
  }
  states = /* @__PURE__ */ new Map();
  failureThreshold;
  recoveryTimeout;
  successThreshold;
  env;
  useDurableObject;
  constructor(failureThreshold = 5, recoveryTimeout = 6e4, successThreshold = 3, env) {
    this.failureThreshold = failureThreshold;
    this.recoveryTimeout = recoveryTimeout;
    this.successThreshold = successThreshold;
    this.env = env;
    this.useDurableObject = !!env?.CIRCUIT_BREAKER_DO;
  }
  /**
   * Get the Durable Object stub for circuit breaker state.
   */
  getDOStub() {
    if (!this.env?.CIRCUIT_BREAKER_DO) return null;
    const id = this.env.CIRCUIT_BREAKER_DO.idFromName("circuit-breaker");
    return this.env.CIRCUIT_BREAKER_DO.get(id);
  }
  async execute(key, operation) {
    if (this.useDurableObject) {
      const stub = this.getDOStub();
      if (stub) {
        try {
          const checkResponse = await stub.fetch(new Request("https://circuit-breaker/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key })
          }));
          if (checkResponse.ok) {
            const checkResult = await checkResponse.json();
            if (!checkResult.allowed) {
              throw new Error(`Circuit breaker is OPEN for ${key}`);
            }
            try {
              const result = await operation();
              await this.reportSuccess(key);
              return result;
            } catch (error) {
              await this.reportFailure(key);
              throw error;
            }
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes("Circuit breaker is OPEN")) {
            throw error;
          }
          console.warn("[CircuitBreaker] Durable Object call failed, using local state:", error);
        }
      }
    }
    const state = this.getState(key);
    if (state.state === "OPEN") {
      if (Date.now() - state.lastFailureTime > this.recoveryTimeout) {
        state.state = "HALF_OPEN";
        state.successCount = 0;
      } else {
        throw new Error(`Circuit breaker is OPEN for ${key}`);
      }
    }
    try {
      const result = await operation();
      this.onSuccess(key);
      return result;
    } catch (error) {
      this.onFailure(key);
      throw error;
    }
  }
  getState(key) {
    if (!this.states.has(key)) {
      this.states.set(key, {
        state: "CLOSED",
        failureCount: 0,
        lastFailureTime: 0,
        successCount: 0,
        nextAttemptTime: 0
      });
    }
    return this.states.get(key);
  }
  onSuccess(key) {
    const state = this.getState(key);
    state.failureCount = 0;
    if (state.state === "HALF_OPEN") {
      state.successCount++;
      if (state.successCount >= this.successThreshold) {
        state.state = "CLOSED";
      }
    }
  }
  onFailure(key) {
    const state = this.getState(key);
    state.failureCount++;
    state.lastFailureTime = Date.now();
    state.nextAttemptTime = Date.now() + this.recoveryTimeout;
    if (state.failureCount >= this.failureThreshold) {
      state.state = "OPEN";
    }
  }
  /**
   * Get state from Durable Object or local state.
   */
  async getDOState(key) {
    if (this.useDurableObject) {
      const stub = this.getDOStub();
      if (stub) {
        try {
          const response = await stub.fetch(new Request(`https://circuit-breaker/state?key=${encodeURIComponent(key)}`));
          if (response.ok) {
            return await response.json();
          }
        } catch (error) {
          console.warn("[CircuitBreaker] Failed to get state from DO:", error);
        }
      }
    }
    return this.states.get(key) || null;
  }
  /**
   * Report success to Durable Object or update local state.
   */
  async reportSuccess(key) {
    if (this.useDurableObject) {
      const stub = this.getDOStub();
      if (stub) {
        try {
          await stub.fetch(new Request("https://circuit-breaker/success", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key })
          }));
          return;
        } catch (error) {
          console.warn("[CircuitBreaker] Failed to report success to DO:", error);
        }
      }
    }
    this.onSuccess(key);
  }
  /**
   * Report failure to Durable Object or update local state.
   */
  async reportFailure(key) {
    if (this.useDurableObject) {
      const stub = this.getDOStub();
      if (stub) {
        try {
          await stub.fetch(new Request("https://circuit-breaker/failure", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key })
          }));
          return;
        } catch (error) {
          console.warn("[CircuitBreaker] Failed to report failure to DO:", error);
        }
      }
    }
    this.onFailure(key);
  }
  async getStateInfo(key) {
    if (this.useDurableObject) {
      return await this.getDOState(key);
    }
    return this.states.get(key) || null;
  }
  // Get all circuit breaker states for monitoring
  async getAllStates() {
    if (this.useDurableObject) {
      const stub = this.getDOStub();
      if (stub) {
        try {
          const response = await stub.fetch(new Request("https://circuit-breaker/state"));
          if (response.ok) {
            const statesObj = await response.json();
            return new Map(Object.entries(statesObj));
          }
        } catch (error) {
          console.warn("[CircuitBreaker] Failed to get all states from DO:", error);
        }
      }
    }
    return new Map(this.states);
  }
  // Reset a specific circuit breaker
  async reset(key) {
    if (this.useDurableObject) {
      const stub = this.getDOStub();
      if (stub) {
        try {
          await stub.fetch(new Request(`https://circuit-breaker/reset?key=${encodeURIComponent(key)}`, { method: "POST" }));
          return;
        } catch (error) {
          console.warn("[CircuitBreaker] Failed to reset in DO:", error);
        }
      }
    }
    this.states.delete(key);
  }
  // Reset all circuit breakers
  async resetAll() {
    if (this.useDurableObject) {
      const stub = this.getDOStub();
      if (stub) {
        try {
          await stub.fetch(new Request("https://circuit-breaker/reset", { method: "POST" }));
          return;
        } catch (error) {
          console.warn("[CircuitBreaker] Failed to reset all in DO:", error);
        }
      }
    }
    this.states.clear();
  }
};
var geocodingCircuitBreaker;
var r2CircuitBreaker;
function initializeCircuitBreakers(env) {
  geocodingCircuitBreaker = new CircuitBreaker(3, 3e4, 2, env);
  r2CircuitBreaker = new CircuitBreaker(5, 6e4, 3, env);
}
__name(initializeCircuitBreakers, "initializeCircuitBreakers");

// src/utils.ts
var DEFAULT_RATE_LIMIT = 100;
var rateLimitStore = /* @__PURE__ */ new Map();
function cleanupRateLimitStore() {
  const now = Date.now();
  const entriesToDelete = [];
  for (const [clientId, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime + 5 * 60 * 1e3) {
      entriesToDelete.push(clientId);
    }
  }
  for (const clientId of entriesToDelete) {
    rateLimitStore.delete(clientId);
  }
  if (rateLimitStore.size > 1e4) {
    const allEntries = Array.from(rateLimitStore.entries());
    allEntries.sort((a, b) => a[1].resetTime - b[1].resetTime);
    for (let i = 0; i < allEntries.length - 5e3; i++) {
      rateLimitStore.delete(allEntries[i][0]);
    }
  }
}
__name(cleanupRateLimitStore, "cleanupRateLimitStore");
function isPointInPolygon(lon, lat, geometry) {
  const point = [lon, lat];
  const type = geometry?.type;
  const coords = geometry?.coordinates;
  if (!type || !coords) return false;
  if (type === "Polygon") {
    return polygonContains(point, coords);
  }
  if (type === "MultiPolygon") {
    for (const poly of coords) {
      if (polygonContains(point, poly)) return true;
    }
    return false;
  }
  return false;
}
__name(isPointInPolygon, "isPointInPolygon");
function polygonContains(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0) return false;
  const outerRing = polygon[0];
  if (!outerRing || !Array.isArray(outerRing)) return false;
  const inOuterRing = ringContains(point, outerRing);
  if (!inOuterRing) return false;
  for (let i = 1; i < polygon.length; i++) {
    const hole = polygon[i];
    if (!hole || !Array.isArray(hole)) continue;
    const inHole = ringContains(point, hole);
    if (inHole) {
      return false;
    }
  }
  return true;
}
__name(polygonContains, "polygonContains");
function ringContains(point, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
      const crossProduct = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1);
      const tolerance = 1e-10;
      if (Math.abs(crossProduct) < tolerance) {
        return true;
      }
    }
    const intersect = y1 > py !== y2 > py && px < (x2 - x1) * (py - y1) / (y2 - y1 + 1e-10) + x1;
    if (intersect) inside = !inside;
  }
  return inside;
}
__name(ringContains, "ringContains");
function sanitizeString(input, maxLength = 1e3) {
  if (!input) return void 0;
  let sanitized = input.replace(/[\x00-\x1F\x7F]/g, "");
  sanitized = sanitized.trim();
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  return sanitized.length > 0 ? sanitized : void 0;
}
__name(sanitizeString, "sanitizeString");
function validateCoordinates(lat, lon) {
  if (lat === void 0 && lon === void 0) {
    return { valid: true };
  }
  if (lat === void 0 || lon === void 0) {
    return { valid: false, error: "Both lat and lon must be provided together" };
  }
  if (lat < -90 || lat > 90) {
    return { valid: false, error: "Latitude must be between -90 and 90 (inclusive)" };
  }
  if (lon < -180 || lon > 180) {
    return { valid: false, error: "Longitude must be between -180 and 180 (inclusive)" };
  }
  if (!isFinite(lat) || !isFinite(lon)) {
    return { valid: false, error: "Coordinates must be finite numbers" };
  }
  return { valid: true, lat, lon };
}
__name(validateCoordinates, "validateCoordinates");
function validatePostalCode(postal) {
  if (!postal) return { valid: true };
  const canadianPattern = /^[A-Za-z]\d[A-Za-z][\s]?\d[A-Za-z]\d$/;
  const sanitized = postal.replace(/\s+/g, "").toUpperCase();
  if (canadianPattern.test(sanitized)) {
    return { valid: true, sanitized: sanitized.substring(0, 3) + " " + sanitized.substring(3) };
  }
  const cleaned = postal.trim().replace(/\s+/g, " ").toUpperCase();
  if (cleaned.length > 0 && cleaned.length <= 20) {
    return { valid: true, sanitized: cleaned };
  }
  return { valid: false, error: "Postal code format is invalid or too long" };
}
__name(validatePostalCode, "validatePostalCode");
function validateAndSanitizeQuery(query) {
  const sanitized = {};
  sanitized.address = sanitizeString(query.address, 500);
  sanitized.city = sanitizeString(query.city, 100);
  sanitized.state = sanitizeString(query.state, 100);
  sanitized.country = sanitizeString(query.country, 100);
  if (query.postal) {
    const postalValidation = validatePostalCode(query.postal);
    if (!postalValidation.valid) {
      return { valid: false, error: postalValidation.error };
    }
    sanitized.postal = postalValidation.sanitized;
  }
  const coordValidation = validateCoordinates(query.lat, query.lon);
  if (!coordValidation.valid) {
    return { valid: false, error: coordValidation.error };
  }
  if (coordValidation.lat !== void 0 && coordValidation.lon !== void 0) {
    sanitized.lat = coordValidation.lat;
    sanitized.lon = coordValidation.lon;
  }
  const hasLocation = sanitized.address || sanitized.postal || sanitized.city || sanitized.state || sanitized.country || sanitized.lat !== void 0 && sanitized.lon !== void 0;
  if (!hasLocation) {
    return { valid: false, error: "At least one location parameter must be provided" };
  }
  return { valid: true, sanitized };
}
__name(validateAndSanitizeQuery, "validateAndSanitizeQuery");
async function withRetry2(operation, config = getRetryConfig(), context = "operation") {
  let lastError;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === config.maxAttempts) {
        console.error(`${context} failed after ${config.maxAttempts} attempts:`, lastError.message);
        throw lastError;
      }
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      );
      const jitteredDelay = config.jitter ? delay + Math.random() * 1e3 : delay;
      console.warn(`${context} attempt ${attempt} failed, retrying in ${Math.round(jitteredDelay)}ms:`, lastError.message);
      await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
    }
  }
  throw lastError;
}
__name(withRetry2, "withRetry");
async function withTimeout2(promise, timeoutMs, operation) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}
__name(withTimeout2, "withTimeout");
function checkRateLimit(env, clientId) {
  if (Math.random() < 0.01) {
    cleanupRateLimitStore();
  }
  const rateLimit = env.RATE_LIMIT || DEFAULT_RATE_LIMIT;
  const now = Date.now();
  const windowMs = 60 * 1e3;
  const current = rateLimitStore.get(clientId);
  if (!current || now > current.resetTime) {
    rateLimitStore.set(clientId, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (current.count >= rateLimit) {
    return false;
  }
  current.count++;
  return true;
}
__name(checkRateLimit, "checkRateLimit");
function getClientId(request) {
  const apiKey = request.headers.get("X-Google-API-Key");
  if (apiKey) return `api:${apiKey}`;
  const cfConnectingIp = request.headers.get("CF-Connecting-IP");
  const xForwardedFor = request.headers.get("X-Forwarded-For");
  const ip = cfConnectingIp || xForwardedFor?.split(",")[0] || "unknown";
  return `ip:${ip}`;
}
__name(getClientId, "getClientId");
function generateCorrelationId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
__name(generateCorrelationId, "generateCorrelationId");
function getCorrelationId(request) {
  return request.headers.get("X-Correlation-ID") || request.headers.get("X-Request-ID") || generateCorrelationId();
}
__name(getCorrelationId, "getCorrelationId");
function pickDataset(pathname) {
  if (pathname === "/api/qc") return { r2Key: "quebecridings-2025.geojson" };
  if (pathname === "/api/on") return { r2Key: "ontarioridings-2022.geojson" };
  return { r2Key: "federalridings-2024.geojson" };
}
__name(pickDataset, "pickDataset");
function parseQuery(request) {
  const url = new URL(request.url);
  const q = url.searchParams;
  const rawQuery = {
    address: q.get("address") || void 0,
    postal: q.get("postal") || q.get("postal_code") || void 0,
    city: q.get("city") || void 0,
    state: q.get("state") || q.get("province") || void 0,
    country: q.get("country") || void 0,
    lat: q.get("lat") ? Number(q.get("lat")) : void 0,
    lon: q.get("lon") || q.get("lng") || q.get("long") ? Number(q.get("lon") || q.get("lng") || q.get("long")) : void 0
  };
  const validation = validateAndSanitizeQuery(rawQuery);
  return { query: rawQuery, validation };
}
__name(parseQuery, "parseQuery");
function badRequest(message, status = 400, code, correlationId, details) {
  const errorResponse = {
    error: message,
    timestamp: Date.now()
  };
  if (code) errorResponse.code = code;
  if (correlationId) errorResponse.correlationId = correlationId;
  if (details) errorResponse.details = details;
  return new Response(JSON.stringify(errorResponse), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8" }
  });
}
__name(badRequest, "badRequest");
function unauthorizedResponse(correlationId) {
  const errorResponse = {
    error: "Unauthorized",
    code: "UNAUTHORIZED",
    timestamp: Date.now()
  };
  if (correlationId) errorResponse.correlationId = correlationId;
  return new Response(JSON.stringify(errorResponse), {
    status: 401,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "WWW-Authenticate": 'Basic realm="Riding Lookup API"'
    }
  });
}
__name(unauthorizedResponse, "unauthorizedResponse");
function rateLimitExceededResponse(correlationId) {
  const errorResponse = {
    error: "Rate limit exceeded",
    code: "RATE_LIMIT_EXCEEDED",
    timestamp: Date.now()
  };
  if (correlationId) errorResponse.correlationId = correlationId;
  return new Response(JSON.stringify(errorResponse), {
    status: 429,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "Retry-After": "60"
    }
  });
}
__name(rateLimitExceededResponse, "rateLimitExceededResponse");
function checkBasicAuth(request, env) {
  if (!env.BASIC_AUTH) return true;
  const googleApiKey = request.headers.get("X-Google-API-Key");
  if (googleApiKey) return true;
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }
  try {
    const encoded = authHeader.substring(6);
    const decoded = atob(encoded);
    return decoded === env.BASIC_AUTH;
  } catch {
    return false;
  }
}
__name(checkBasicAuth, "checkBasicAuth");

// src/cache.ts
var CACHE_CONFIG = {
  MAX_SIZE: 30,
  // Maximum number of datasets to cache
  MAX_AGE: TIME_CONSTANTS.TWENTY_FOUR_HOURS_MS
};
var CACHE_WARMING_CONFIG = {
  ENABLED: true,
  WARMING_INTERVAL: TIME_CONSTANTS.SIX_HOURS_MS,
  BATCH_SIZE: 5,
  POPULAR_LOCATIONS: [
    { name: "Toronto", lat: 43.6532, lon: -79.3832 },
    { name: "Vancouver", lat: 49.2827, lon: -123.1207 },
    { name: "Montreal", lat: 45.5017, lon: -73.5673 },
    { name: "Calgary", lat: 51.0447, lon: -114.0719 },
    { name: "Ottawa", lat: 45.4215, lon: -75.6972 },
    { name: "Edmonton", lat: 53.5461, lon: -113.4938 },
    { name: "Winnipeg", lat: 49.8951, lon: -97.1384 },
    { name: "Quebec City", lat: 46.8139, lon: -71.208 },
    { name: "Hamilton", lat: 43.2557, lon: -79.8711 },
    { name: "London", lat: 42.9849, lon: -81.2453 }
  ],
  POPULAR_POSTAL_CODES: [
    "M5V 3A8",
    // Toronto
    "V6B 1A1",
    // Vancouver
    "H2Y 1C6",
    // Montreal
    "T2P 1J9",
    // Calgary
    "K1A 0A6",
    // Ottawa
    "T5J 2R2",
    // Edmonton
    "R3C 1A5",
    // Winnipeg
    "G1R 2B5",
    // Quebec City
    "L8P 4X3",
    // Hamilton
    "N6A 3K7"
    // London
  ]
};
var LRUCache = class {
  static {
    __name(this, "LRUCache");
  }
  cache = /* @__PURE__ */ new Map();
  accessOrder = [];
  maxSize;
  maxAge;
  constructor(maxSize, maxAge) {
    this.maxSize = maxSize;
    this.maxAge = maxAge;
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      return void 0;
    }
    const age = Date.now() - entry.timestamp;
    if (age > this.maxAge) {
      this.delete(key);
      return void 0;
    }
    this.moveToEnd(key);
    return entry.value;
  }
  set(key, value) {
    const now = Date.now();
    const newEntry = { value, timestamp: now };
    if (this.cache.has(key)) {
      this.cache.set(key, newEntry);
      this.moveToEnd(key);
      return;
    }
    if (this.cache.size >= this.maxSize) {
      const lruKey = this.accessOrder.shift();
      if (lruKey) {
        this.cache.delete(lruKey);
      }
    }
    this.cache.set(key, newEntry);
    this.accessOrder.push(key);
  }
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }
    const age = Date.now() - entry.timestamp;
    if (age > this.maxAge) {
      this.delete(key);
      return false;
    }
    return true;
  }
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    }
    return deleted;
  }
  clear() {
    this.cache.clear();
    this.accessOrder = [];
  }
  size() {
    return this.cache.size;
  }
  moveToEnd(key) {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
      this.accessOrder.push(key);
    }
  }
};
var geoCacheLRU = new LRUCache(CACHE_CONFIG.MAX_SIZE, CACHE_CONFIG.MAX_AGE);
var spatialIndexCacheLRU = new LRUCache(CACHE_CONFIG.MAX_SIZE, CACHE_CONFIG.MAX_AGE);
var cacheWarmingState = {
  isRunning: false,
  lastWarmed: 0,
  currentBatch: 0,
  totalBatches: 0,
  successCount: 0,
  failureCount: 0,
  nextWarmingTime: 0,
  lastError: void 0
};
var cacheWarmingLock = false;
async function warmCacheForLocation(env, lat, lon, locationName, loadGeo2, lookupRiding2) {
  try {
    const datasets = [
      { pathname: "/api", r2Key: "federalridings-2024.geojson" },
      { pathname: "/api/qc", r2Key: "quebecridings-2025.geojson" },
      { pathname: "/api/on", r2Key: "ontarioridings-2022.geojson" }
    ];
    for (const dataset of datasets) {
      try {
        await loadGeo2(env, dataset.r2Key);
        const result = await lookupRiding2(env, dataset.pathname, lon, lat);
        const cacheKey = generateLookupCacheKey({ lat, lon }, dataset.pathname);
        const datasetName = dataset.r2Key.replace(".geojson", "");
        await setCachedLookupResult(env, cacheKey, result, datasetName, { lon, lat });
        console.log(`Cache warmed for ${locationName} on ${dataset.pathname}`);
      } catch (error) {
        console.warn(`Failed to warm cache for ${locationName} on ${dataset.pathname}:`, error);
      }
    }
    return true;
  } catch (error) {
    console.error(`Cache warming failed for ${locationName}:`, error);
    return false;
  }
}
__name(warmCacheForLocation, "warmCacheForLocation");
async function warmCacheForPostalCode(env, postalCode, loadGeo2, lookupRiding2) {
  try {
    const query = { postal: postalCode };
    const { lon, lat } = await geocodeIfNeeded(env, query, void 0, void 0, geocodingCircuitBreaker ? {
      execute: /* @__PURE__ */ __name((key, fn) => geocodingCircuitBreaker.execute(key, fn), "execute")
    } : void 0);
    const locationWarmed = await warmCacheForLocation(env, lat, lon, `Postal Code ${postalCode}`, loadGeo2, lookupRiding2);
    const datasets = [
      { pathname: "/api", r2Key: "federalridings-2024.geojson" },
      { pathname: "/api/qc", r2Key: "quebecridings-2025.geojson" },
      { pathname: "/api/on", r2Key: "ontarioridings-2022.geojson" }
    ];
    for (const dataset of datasets) {
      try {
        const result = await lookupRiding2(env, dataset.pathname, lon, lat);
        const cacheKey = generateLookupCacheKey({ postal: postalCode }, dataset.pathname);
        const datasetName = dataset.r2Key.replace(".geojson", "");
        await setCachedLookupResult(env, cacheKey, result, datasetName, { lon, lat });
      } catch (error) {
        console.warn(`Failed to warm lookup cache for postal code ${postalCode} on ${dataset.pathname}:`, error);
      }
    }
    return locationWarmed;
  } catch (error) {
    console.error(`Cache warming failed for postal code ${postalCode}:`, error);
    return false;
  }
}
__name(warmCacheForPostalCode, "warmCacheForPostalCode");
async function performCacheWarming(env, loadGeo2, lookupRiding2) {
  if (!CACHE_WARMING_CONFIG.ENABLED) {
    return;
  }
  if (cacheWarmingLock || cacheWarmingState.isRunning) {
    return;
  }
  const now = Date.now();
  if (now < cacheWarmingState.nextWarmingTime) {
    return;
  }
  cacheWarmingLock = true;
  if (cacheWarmingState.isRunning) {
    cacheWarmingLock = false;
    return;
  }
  cacheWarmingState.isRunning = true;
  cacheWarmingLock = false;
  cacheWarmingState.currentBatch = 0;
  cacheWarmingState.successCount = 0;
  cacheWarmingState.failureCount = 0;
  try {
    console.log("Starting cache warming process...");
    const totalLocations = CACHE_WARMING_CONFIG.POPULAR_LOCATIONS.length + CACHE_WARMING_CONFIG.POPULAR_POSTAL_CODES.length;
    cacheWarmingState.totalBatches = Math.ceil(totalLocations / CACHE_WARMING_CONFIG.BATCH_SIZE);
    for (let i = 0; i < CACHE_WARMING_CONFIG.POPULAR_LOCATIONS.length; i += CACHE_WARMING_CONFIG.BATCH_SIZE) {
      const batch = CACHE_WARMING_CONFIG.POPULAR_LOCATIONS.slice(i, i + CACHE_WARMING_CONFIG.BATCH_SIZE);
      cacheWarmingState.currentBatch++;
      console.log(`Warming batch ${cacheWarmingState.currentBatch}/${cacheWarmingState.totalBatches} (locations)`);
      const promises = batch.map(async (location) => {
        const success = await warmCacheForLocation(env, location.lat, location.lon, location.name, loadGeo2, lookupRiding2);
        if (success) {
          cacheWarmingState.successCount++;
        } else {
          cacheWarmingState.failureCount++;
        }
        return success;
      });
      await Promise.allSettled(promises);
      await new Promise((resolve) => setTimeout(resolve, 1e3));
    }
    for (let i = 0; i < CACHE_WARMING_CONFIG.POPULAR_POSTAL_CODES.length; i += CACHE_WARMING_CONFIG.BATCH_SIZE) {
      const batch = CACHE_WARMING_CONFIG.POPULAR_POSTAL_CODES.slice(i, i + CACHE_WARMING_CONFIG.BATCH_SIZE);
      cacheWarmingState.currentBatch++;
      console.log(`Warming batch ${cacheWarmingState.currentBatch}/${cacheWarmingState.totalBatches} (postal codes)`);
      const promises = batch.map(async (postalCode) => {
        const success = await warmCacheForPostalCode(env, postalCode, loadGeo2, lookupRiding2);
        if (success) {
          cacheWarmingState.successCount++;
        } else {
          cacheWarmingState.failureCount++;
        }
        return success;
      });
      await Promise.allSettled(promises);
      await new Promise((resolve) => setTimeout(resolve, 1e3));
    }
    cacheWarmingState.lastWarmed = now;
    cacheWarmingState.nextWarmingTime = now + CACHE_WARMING_CONFIG.WARMING_INTERVAL;
    console.log(`Cache warming completed. Success: ${cacheWarmingState.successCount}, Failures: ${cacheWarmingState.failureCount}`);
  } catch (error) {
    console.error("Cache warming process failed:", error);
    cacheWarmingState.lastError = error instanceof Error ? error.message : "Unknown error";
  } finally {
    cacheWarmingState.isRunning = false;
    cacheWarmingLock = false;
  }
}
__name(performCacheWarming, "performCacheWarming");
function getCacheWarmingStatus() {
  return { ...cacheWarmingState };
}
__name(getCacheWarmingStatus, "getCacheWarmingStatus");
function setCachedGeoJSON(key, data) {
  geoCacheLRU.set(key, data);
}
__name(setCachedGeoJSON, "setCachedGeoJSON");
function setCachedSpatialIndex(key, data) {
  spatialIndexCacheLRU.set(key, data);
}
__name(setCachedSpatialIndex, "setCachedSpatialIndex");
var simplifiedBoundariesCacheLRU = new LRUCache(CACHE_CONFIG.MAX_SIZE, CACHE_CONFIG.MAX_AGE);
function generateLookupCacheKey(query, pathname) {
  const { r2Key } = pickDataset(pathname);
  const dataset = r2Key.replace(".geojson", "");
  const normalizeCoord = /* @__PURE__ */ __name((coord) => {
    if (coord === void 0) return void 0;
    return (Math.round(coord * 1e5) / 1e5).toString();
  }, "normalizeCoord");
  const normalizeString = /* @__PURE__ */ __name((str) => {
    if (!str) return void 0;
    return str.toLowerCase().trim().replace(/\s+/g, " ");
  }, "normalizeString");
  let type;
  let value;
  if (query.lat !== void 0 && query.lon !== void 0) {
    type = "coordinate";
    const latNorm = normalizeCoord(query.lat);
    const lonNorm = normalizeCoord(query.lon);
    value = `${lonNorm},${latNorm}`;
  } else if (query.postal) {
    type = "postal";
    value = normalizeString(query.postal)?.replace(/\s+/g, "") || "";
  } else if (query.address) {
    type = "address";
    const parts = [];
    if (query.address) parts.push(normalizeString(query.address) || "");
    if (query.city) parts.push(normalizeString(query.city) || "");
    if (query.state) parts.push(normalizeString(query.state) || "");
    if (query.country) parts.push(normalizeString(query.country) || "");
    value = parts.filter(Boolean).join(" ");
  } else {
    type = "query";
    const parts = [];
    if (query.city) parts.push(normalizeString(query.city) || "");
    if (query.state) parts.push(normalizeString(query.state) || "");
    if (query.country) parts.push(normalizeString(query.country) || "");
    value = parts.filter(Boolean).join(" ") || "unknown";
  }
  const key = `lookup:${dataset}:${type}:${value}:${pathname}`;
  if (key.length > 512) {
    const hash = key.split("").reduce((acc, char) => {
      const hash2 = (acc << 5) - acc + char.charCodeAt(0);
      return hash2 & hash2;
    }, 0);
    return `lookup:${dataset}:${type}:hash:${Math.abs(hash)}:${pathname}`;
  }
  return key;
}
__name(generateLookupCacheKey, "generateLookupCacheKey");
async function getCachedLookupResult(env, cacheKey) {
  if (!env.LOOKUP_CACHE) return null;
  try {
    const cached = await env.LOOKUP_CACHE.get(cacheKey, "json");
    if (!cached) return null;
    const maxAge = TIME_CONSTANTS.TWENTY_FOUR_HOURS_MS;
    if (Date.now() - cached.timestamp > maxAge) {
      await env.LOOKUP_CACHE.delete(cacheKey);
      return null;
    }
    return cached;
  } catch (error) {
    console.warn("Failed to get cached lookup result:", error);
    return null;
  }
}
__name(getCachedLookupResult, "getCachedLookupResult");
async function setCachedLookupResult(env, cacheKey, result, dataset, point) {
  if (!env.LOOKUP_CACHE) return;
  try {
    const entry = {
      properties: result.properties,
      riding: result.riding,
      point,
      normalizedAddress: result.normalizedAddress,
      timestamp: Date.now(),
      dataset
    };
    await env.LOOKUP_CACHE.put(cacheKey, JSON.stringify(entry), {
      expirationTtl: TIME_CONSTANTS_SECONDS.TWENTY_FOUR_HOURS
    });
  } catch (error) {
    console.warn("Failed to cache lookup result:", error);
  }
}
__name(setCachedLookupResult, "setCachedLookupResult");

// src/metrics.ts
var METRICS_WINDOW_MS = TIME_CONSTANTS.TWENTY_FOUR_HOURS_MS;
var METRICS_RESET_INTERVAL_MS = TIME_CONSTANTS.TWENTY_FOUR_HOURS_MS;
var lastResetTime = Date.now();
var metrics = {
  geocodingRequests: 0,
  geocodingCacheHits: 0,
  geocodingCacheMisses: 0,
  geocodingErrors: 0,
  geocodingSuccesses: 0,
  geocodingFailures: 0,
  geocodingCircuitBreakerTrips: 0,
  r2Requests: 0,
  r2CacheHits: 0,
  r2CacheMisses: 0,
  r2Errors: 0,
  r2Successes: 0,
  r2Failures: 0,
  r2CircuitBreakerTrips: 0,
  spatialIndexHits: 0,
  spatialIndexMisses: 0,
  totalSpatialIndexTime: 0,
  lookupRequests: 0,
  lookupCacheHits: 0,
  lookupCacheMisses: 0,
  lookupErrors: 0,
  batchRequests: 0,
  batchErrors: 0,
  webhookDeliveries: 0,
  webhookFailures: 0,
  requestCount: 0,
  errorCount: 0,
  totalLookupTime: 0,
  totalGeocodingTime: 0,
  totalR2Time: 0,
  totalBatchTime: 0,
  totalWebhookTime: 0
};
function checkAndResetMetrics() {
  const now = Date.now();
  if (now - lastResetTime >= METRICS_RESET_INTERVAL_MS) {
    resetMetrics();
    lastResetTime = now;
  }
}
__name(checkAndResetMetrics, "checkAndResetMetrics");
function incrementMetric(key, value = 1) {
  checkAndResetMetrics();
  metrics[key] += value;
}
__name(incrementMetric, "incrementMetric");
function recordTiming(key, duration) {
  checkAndResetMetrics();
  metrics[key] += duration;
}
__name(recordTiming, "recordTiming");
function getMetrics() {
  return { ...metrics };
}
__name(getMetrics, "getMetrics");
function resetMetrics() {
  Object.keys(metrics).forEach((key) => {
    metrics[key] = 0;
  });
  lastResetTime = Date.now();
}
__name(resetMetrics, "resetMetrics");
function getMetricsSummary() {
  const totalRequests = metrics.requestCount;
  const totalErrors = metrics.errorCount;
  const errorRate = totalRequests > 0 ? totalErrors / totalRequests * 100 : 0;
  const geocodingHitRate = metrics.geocodingRequests > 0 ? metrics.geocodingCacheHits / metrics.geocodingRequests * 100 : 0;
  const geocodingAvgTime = metrics.geocodingRequests > 0 ? metrics.totalGeocodingTime / metrics.geocodingRequests : 0;
  const r2HitRate = metrics.r2Requests > 0 ? metrics.r2CacheHits / metrics.r2Requests * 100 : 0;
  const r2AvgTime = metrics.r2Requests > 0 ? metrics.totalR2Time / metrics.r2Requests : 0;
  const lookupHitRate = metrics.lookupRequests > 0 ? metrics.lookupCacheHits / metrics.lookupRequests * 100 : 0;
  const lookupAvgTime = metrics.lookupRequests > 0 ? metrics.totalLookupTime / metrics.lookupRequests : 0;
  const batchAvgTime = metrics.batchRequests > 0 ? metrics.totalBatchTime / metrics.batchRequests : 0;
  const webhookTotal = metrics.webhookDeliveries + metrics.webhookFailures;
  const webhookSuccessRate = webhookTotal > 0 ? metrics.webhookDeliveries / webhookTotal * 100 : 0;
  const webhookAvgTime = webhookTotal > 0 ? metrics.totalWebhookTime / webhookTotal : 0;
  return {
    requests: {
      total: totalRequests,
      errors: totalErrors,
      errorRate: Math.round(errorRate * 100) / 100
    },
    geocoding: {
      requests: metrics.geocodingRequests,
      cacheHits: metrics.geocodingCacheHits,
      cacheMisses: metrics.geocodingCacheMisses,
      errors: metrics.geocodingErrors,
      hitRate: Math.round(geocodingHitRate * 100) / 100,
      avgTime: Math.round(geocodingAvgTime * 100) / 100
    },
    r2: {
      requests: metrics.r2Requests,
      cacheHits: metrics.r2CacheHits,
      cacheMisses: metrics.r2CacheMisses,
      errors: metrics.r2Errors,
      hitRate: Math.round(r2HitRate * 100) / 100,
      avgTime: Math.round(r2AvgTime * 100) / 100
    },
    lookup: {
      requests: metrics.lookupRequests,
      cacheHits: metrics.lookupCacheHits,
      cacheMisses: metrics.lookupCacheMisses,
      errors: metrics.lookupErrors,
      hitRate: Math.round(lookupHitRate * 100) / 100,
      avgTime: Math.round(lookupAvgTime * 100) / 100
    },
    batch: {
      requests: metrics.batchRequests,
      errors: metrics.batchErrors,
      avgTime: Math.round(batchAvgTime * 100) / 100
    },
    webhooks: {
      deliveries: metrics.webhookDeliveries,
      failures: metrics.webhookFailures,
      successRate: Math.round(webhookSuccessRate * 100) / 100,
      avgTime: Math.round(webhookAvgTime * 100) / 100
    }
  };
}
__name(getMetricsSummary, "getMetricsSummary");

// src/spatial.ts
function getSpatialDbConfig(env) {
  return {
    ENABLED: env?.SPATIAL_DB_ENABLED === "true" || env?.SPATIAL_DB_ENABLED === "1",
    USE_RTREE_INDEX: true,
    BATCH_INSERT_SIZE: 100
  };
}
__name(getSpatialDbConfig, "getSpatialDbConfig");
function calculateBoundingBox(geometry) {
  if (!geometry || !geometry.coordinates) {
    throw new Error("Geometry missing coordinates");
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const processCoordinates = /* @__PURE__ */ __name((coords) => {
    if (!Array.isArray(coords) || coords.length === 0) {
      return;
    }
    for (const coord of coords) {
      if (!Array.isArray(coord) || coord.length < 2) {
        continue;
      }
      const [x, y] = coord;
      if (typeof x !== "number" || typeof y !== "number" || isNaN(x) || isNaN(y)) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }, "processCoordinates");
  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates;
    if (!Array.isArray(coords) || coords.length === 0) {
      throw new Error("Polygon coordinates must be a non-empty array");
    }
    for (const ring of coords) {
      processCoordinates(ring);
    }
  } else if (geometry.type === "MultiPolygon") {
    const coords = geometry.coordinates;
    if (!Array.isArray(coords) || coords.length === 0) {
      throw new Error("MultiPolygon coordinates must be a non-empty array");
    }
    for (const polygon of coords) {
      if (!Array.isArray(polygon)) continue;
      for (const ring of polygon) {
        processCoordinates(ring);
      }
    }
  } else {
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }
  if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
    throw new Error("No valid coordinates found in geometry");
  }
  return { minX, minY, maxX, maxY };
}
__name(calculateBoundingBox, "calculateBoundingBox");
function createSpatialIndex(featureCollection) {
  const entries = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const feature of featureCollection.features) {
    const boundingBox = calculateBoundingBox(feature.geometry);
    entries.push({ feature, boundingBox });
    minX = Math.min(minX, boundingBox.minX);
    minY = Math.min(minY, boundingBox.minY);
    maxX = Math.max(maxX, boundingBox.maxX);
    maxY = Math.max(maxY, boundingBox.maxY);
  }
  return {
    entries,
    boundingBox: { minX, minY, maxX, maxY }
  };
}
__name(createSpatialIndex, "createSpatialIndex");
function isPointInBoundingBox(lon, lat, boundingBox) {
  return lon >= boundingBox.minX && lon <= boundingBox.maxX && lat >= boundingBox.minY && lat <= boundingBox.maxY;
}
__name(isPointInBoundingBox, "isPointInBoundingBox");
function findCandidateFeatures(lon, lat, spatialIndex) {
  const candidates = [];
  for (const entry of spatialIndex.entries) {
    if (isPointInBoundingBox(lon, lat, entry.boundingBox)) {
      candidates.push(entry.feature);
    }
  }
  return candidates;
}
__name(findCandidateFeatures, "findCandidateFeatures");
function calculateCentroid(geometry) {
  if (geometry.type === "Point") {
    return { lon: geometry.coordinates[0], lat: geometry.coordinates[1] };
  }
  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates[0];
    let lonSum = 0, latSum = 0;
    for (const coord of coords) {
      lonSum += coord[0];
      latSum += coord[1];
    }
    return { lon: lonSum / coords.length, lat: latSum / coords.length };
  }
  if (geometry.type === "MultiPolygon") {
    let largestPolygon = geometry.coordinates[0];
    let largestVertexCount = 0;
    for (const polygon of geometry.coordinates) {
      const vertexCount = polygon[0].length;
      if (vertexCount > largestVertexCount) {
        largestVertexCount = vertexCount;
        largestPolygon = polygon;
      }
    }
    const coords = largestPolygon[0];
    let lonSum = 0, latSum = 0;
    for (const coord of coords) {
      lonSum += coord[0];
      latSum += coord[1];
    }
    return { lon: lonSum / coords.length, lat: latSum / coords.length };
  }
  return { lon: 0, lat: 0 };
}
__name(calculateCentroid, "calculateCentroid");
async function initializeSpatialDatabase(env) {
  const dbConfig = getSpatialDbConfig(env);
  if (!dbConfig.ENABLED || !env.RIDING_DB) {
    return false;
  }
  try {
    await env.RIDING_DB.prepare(`
      CREATE TABLE IF NOT EXISTS spatial_features (
        id TEXT PRIMARY KEY,
        dataset TEXT NOT NULL,
        feature_data TEXT NOT NULL,
        minx REAL NOT NULL,
        miny REAL NOT NULL,
        maxx REAL NOT NULL,
        maxy REAL NOT NULL,
        centroid_lon REAL NOT NULL,
        centroid_lat REAL NOT NULL,
        area REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.RIDING_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_spatial_bounds ON spatial_features(minx, miny, maxx, maxy)
    `).run();
    await env.RIDING_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_spatial_centroid ON spatial_features(centroid_lon, centroid_lat)
    `).run();
    await env.RIDING_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_dataset ON spatial_features(dataset)
    `).run();
    if (dbConfig.USE_RTREE_INDEX) {
      await env.RIDING_DB.prepare(`
        CREATE VIRTUAL TABLE IF NOT EXISTS spatial_rtree USING rtree(
          id,
          minx, maxx,
          miny, maxy
        )
      `).run();
    }
    console.log("Spatial database initialized successfully");
    return true;
  } catch (error) {
    console.error("Failed to initialize spatial database:", error);
    return false;
  }
}
__name(initializeSpatialDatabase, "initializeSpatialDatabase");
async function insertFeaturesIntoDatabase(env, dataset, features) {
  const dbConfig = getSpatialDbConfig(env);
  if (!dbConfig.ENABLED || !env.RIDING_DB) {
    return false;
  }
  try {
    const statements = [];
    for (const feature of features) {
      const bbox = calculateBoundingBox(feature.geometry);
      const centroid = calculateCentroid(feature.geometry);
      const area = 0;
      const featureId = `${dataset}_${feature.properties?.FED_NUM || feature.properties?.RIDING_NUM || feature.properties?.ID || Date.now()}`;
      statements.push(env.RIDING_DB.prepare(`
        INSERT OR REPLACE INTO spatial_features 
        (id, dataset, feature_data, minx, miny, maxx, maxy, centroid_lon, centroid_lat, area)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        featureId,
        dataset,
        JSON.stringify(feature),
        bbox.minX,
        bbox.minY,
        bbox.maxX,
        bbox.maxY,
        centroid.lon,
        centroid.lat,
        area
      ));
      if (dbConfig.USE_RTREE_INDEX) {
        statements.push(env.RIDING_DB.prepare(`
          INSERT OR REPLACE INTO spatial_rtree (id, minx, maxx, miny, maxy)
          VALUES (?, ?, ?, ?, ?)
        `).bind(featureId, bbox.minX, bbox.maxX, bbox.minY, bbox.maxY));
      }
    }
    await env.RIDING_DB.batch(statements);
    console.log(`Inserted ${features.length} features into spatial database for dataset: ${dataset}`);
    return true;
  } catch (error) {
    console.error("Failed to insert features into spatial database:", error);
    return false;
  }
}
__name(insertFeaturesIntoDatabase, "insertFeaturesIntoDatabase");
async function queryRidingFromDatabase(env, dataset, lon, lat) {
  const dbConfig = getSpatialDbConfig(env);
  if (!dbConfig.ENABLED || !env.RIDING_DB) {
    return null;
  }
  try {
    let query = "";
    let params = [];
    if (dbConfig.USE_RTREE_INDEX) {
      query = `
        SELECT sf.feature_data 
        FROM spatial_features sf
        JOIN spatial_rtree sr ON sf.id = sr.id
        WHERE sf.dataset = ? 
        AND sr.minx <= ? AND sr.maxx >= ?
        AND sr.miny <= ? AND sr.maxy >= ?
      `;
      params = [dataset, lon, lon, lat, lat];
    } else {
      query = `
        SELECT feature_data 
        FROM spatial_features 
        WHERE dataset = ? 
        AND minx <= ? AND maxx >= ?
        AND miny <= ? AND maxy >= ?
      `;
      params = [dataset, lon, lon, lat, lat];
    }
    const results = await env.RIDING_DB.prepare(query).bind(...params).all();
    if (!results || !results.results) {
      return null;
    }
    for (const result of results.results) {
      if (!result || !result.feature_data) {
        continue;
      }
      try {
        const feature = JSON.parse(result.feature_data);
        if (feature && feature.geometry && isPointInPolygon(lon, lat, feature.geometry)) {
          return feature;
        }
      } catch (parseError) {
        console.warn("Failed to parse feature_data from database:", parseError);
        continue;
      }
    }
    return null;
  } catch (error) {
    console.error("Failed to query spatial database:", error);
    return null;
  }
}
__name(queryRidingFromDatabase, "queryRidingFromDatabase");
async function getAllFeaturesFromDatabase(env, dataset, limit = 100, offset = 0) {
  const dbConfig = getSpatialDbConfig(env);
  if (!dbConfig.ENABLED || !env.RIDING_DB) {
    return { features: [], total: 0 };
  }
  try {
    const countResult = await env.RIDING_DB.prepare(`
      SELECT COUNT(*) as total FROM spatial_features WHERE dataset = ?
    `).bind(dataset).first();
    const total = countResult && typeof countResult.total === "number" ? countResult.total : 0;
    const results = await env.RIDING_DB.prepare(`
      SELECT feature_data 
      FROM spatial_features 
      WHERE dataset = ? 
      ORDER BY id
      LIMIT ? OFFSET ?
    `).bind(dataset, limit, offset).all();
    if (!results || !results.results) {
      return { features: [], total };
    }
    const features = [];
    for (const result of results.results) {
      if (!result || !result.feature_data) {
        continue;
      }
      try {
        const feature = JSON.parse(result.feature_data);
        if (feature && feature.type === "Feature") {
          features.push(feature);
        }
      } catch (parseError) {
        console.warn("Failed to parse feature_data from database:", parseError);
        continue;
      }
    }
    return { features, total };
  } catch (error) {
    console.error("Failed to get features from spatial database:", error);
    return { features: [], total: 0 };
  }
}
__name(getAllFeaturesFromDatabase, "getAllFeaturesFromDatabase");
async function syncGeoJSONToDatabase(env, dataset, loadGeo2) {
  const dbConfig = getSpatialDbConfig(env);
  if (!dbConfig.ENABLED || !env.RIDING_DB) {
    return false;
  }
  try {
    console.log(`Starting sync of ${dataset} to spatial database...`);
    const featureCollection = await loadGeo2(env, dataset);
    await initializeSpatialDatabase(env);
    await env.RIDING_DB.prepare(`DELETE FROM spatial_features WHERE dataset = ?`).bind(dataset).run();
    if (dbConfig.USE_RTREE_INDEX) {
      const existingIds = await env.RIDING_DB.prepare(`
        SELECT id FROM spatial_features WHERE dataset = ?
      `).bind(dataset).all();
      for (const row of existingIds.results) {
        await env.RIDING_DB.prepare(`DELETE FROM spatial_rtree WHERE id = ?`).bind(row.id).run();
      }
    }
    const batchSize = dbConfig.BATCH_INSERT_SIZE;
    for (let i = 0; i < featureCollection.features.length; i += batchSize) {
      const batch = featureCollection.features.slice(i, i + batchSize);
      await insertFeaturesIntoDatabase(env, dataset, batch);
    }
    console.log(`Successfully synced ${featureCollection.features.length} features to spatial database`);
    return true;
  } catch (error) {
    console.error("Failed to sync GeoJSON to spatial database:", error);
    return false;
  }
}
__name(syncGeoJSONToDatabase, "syncGeoJSONToDatabase");

// src/webhooks.ts
var WEBHOOK_CONFIG = {
  ENABLED: true,
  MAX_RETRY_ATTEMPTS: 5,
  RETRY_DELAY: 5e3,
  // 5 seconds
  TIMEOUT: 3e4,
  // 30 seconds
  MAX_WEBHOOKS: 10,
  CLEANUP_INTERVAL: TIME_CONSTANTS.TWENTY_FOUR_HOURS_MS,
  MAX_EVENT_AGE: TIME_CONSTANTS.SEVEN_DAYS_MS
};
var WEBHOOK_CONFIG_PREFIX = "webhook:config:";
var WEBHOOK_EVENT_PREFIX = "webhook:event:";
var WEBHOOK_DELIVERY_PREFIX = "webhook:delivery:";
var WEBHOOK_INDEX_KEY = "webhook:index";
var WEBHOOK_EVENT_INDEX_KEY = "webhook:event:index";
var WEBHOOK_DELIVERY_INDEX_KEY = "webhook:delivery:index";
var webhookProcessingInitialized = false;
function generateWebhookId() {
  return `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
__name(generateWebhookId, "generateWebhookId");
function generateDeliveryId() {
  return `delivery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
__name(generateDeliveryId, "generateDeliveryId");
async function getWebhookConfig(env, webhookId) {
  if (!env.WEBHOOKS) {
    return null;
  }
  const data = await env.WEBHOOKS.get(`${WEBHOOK_CONFIG_PREFIX}${webhookId}`, "json");
  return data;
}
__name(getWebhookConfig, "getWebhookConfig");
async function setWebhookConfig(env, webhookId, config) {
  if (!env.WEBHOOKS) return;
  await env.WEBHOOKS.put(`${WEBHOOK_CONFIG_PREFIX}${webhookId}`, JSON.stringify(config));
  const index = await getWebhookIndex(env);
  if (!index.includes(webhookId)) {
    index.push(webhookId);
    await env.WEBHOOKS.put(WEBHOOK_INDEX_KEY, JSON.stringify(index));
  }
}
__name(setWebhookConfig, "setWebhookConfig");
async function getWebhookIndex(env) {
  if (!env.WEBHOOKS) return [];
  const data = await env.WEBHOOKS.get(WEBHOOK_INDEX_KEY, "json");
  return data || [];
}
__name(getWebhookIndex, "getWebhookIndex");
async function getEventIndex(env) {
  if (!env.WEBHOOKS) return [];
  const data = await env.WEBHOOKS.get(WEBHOOK_EVENT_INDEX_KEY, "json");
  return data || [];
}
__name(getEventIndex, "getEventIndex");
async function getDeliveryIndex(env) {
  if (!env.WEBHOOKS) return [];
  const data = await env.WEBHOOKS.get(WEBHOOK_DELIVERY_INDEX_KEY, "json");
  return data || [];
}
__name(getDeliveryIndex, "getDeliveryIndex");
async function addDeliveryToIndex(env, deliveryId) {
  if (!env.WEBHOOKS) return;
  const index = await getDeliveryIndex(env);
  if (!index.includes(deliveryId)) {
    index.push(deliveryId);
    await env.WEBHOOKS.put(WEBHOOK_DELIVERY_INDEX_KEY, JSON.stringify(index));
  }
}
__name(addDeliveryToIndex, "addDeliveryToIndex");
async function createWebhookSignature(secret, payload) {
  const encoder = new TextEncoder();
  const key = encoder.encode(secret);
  const data = encoder.encode(payload);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256=${hashHex}`;
}
__name(createWebhookSignature, "createWebhookSignature");
async function deliverWebhook(env, webhookId, eventId) {
  const webhook = await getWebhookConfig(env, webhookId);
  if (!env.WEBHOOKS) return false;
  const eventData = await env.WEBHOOKS.get(`${WEBHOOK_EVENT_PREFIX}${eventId}`, "json");
  const event = eventData;
  if (!webhook || !event || !webhook.active) {
    return false;
  }
  const deliveryId = generateDeliveryId();
  const startTime = Date.now();
  const delivery = {
    id: deliveryId,
    webhookId,
    eventId,
    status: "success",
    responseCode: void 0,
    responseBody: void 0,
    attemptedAt: startTime,
    duration: 0,
    error: void 0
  };
  try {
    const signature = await createWebhookSignature(webhook.secret, JSON.stringify(event.payload));
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "riding-lookup-webhook/1.0",
        "X-Webhook-Event": event.eventType,
        "X-Webhook-Signature": signature,
        "X-Webhook-Delivery": deliveryId
      },
      body: JSON.stringify(event.payload),
      signal: AbortSignal.timeout(WEBHOOK_CONFIG.TIMEOUT)
    });
    const endTime = Date.now();
    delivery.duration = endTime - startTime;
    delivery.responseCode = response.status;
    delivery.responseBody = await response.text();
    if (response.ok) {
      delivery.status = "success";
      event.status = "delivered";
      event.attempts++;
      event.lastAttempt = endTime;
      if (env.WEBHOOKS) {
        await env.WEBHOOKS.put(`${WEBHOOK_EVENT_PREFIX}${eventId}`, JSON.stringify(event));
        await env.WEBHOOKS.put(`${WEBHOOK_DELIVERY_PREFIX}${deliveryId}`, JSON.stringify(delivery));
        await addDeliveryToIndex(env, deliveryId);
      }
      return true;
    } else {
      delivery.status = "failed";
      delivery.error = `HTTP ${response.status}: ${delivery.responseBody}`;
      if (env.WEBHOOKS) {
        await env.WEBHOOKS.put(`${WEBHOOK_DELIVERY_PREFIX}${deliveryId}`, JSON.stringify(delivery));
        await addDeliveryToIndex(env, deliveryId);
      }
      if (event.attempts < event.maxAttempts) {
        event.status = "pending";
        event.attempts++;
        event.nextRetry = Date.now() + WEBHOOK_CONFIG.RETRY_DELAY * Math.pow(2, event.attempts - 1);
        event.lastAttempt = endTime;
        if (env.WEBHOOKS) {
          await env.WEBHOOKS.put(`${WEBHOOK_EVENT_PREFIX}${eventId}`, JSON.stringify(event));
        }
      } else {
        event.status = "failed";
        event.lastAttempt = endTime;
        if (env.WEBHOOKS) {
          await env.WEBHOOKS.put(`${WEBHOOK_EVENT_PREFIX}${eventId}`, JSON.stringify(event));
        }
      }
      return false;
    }
  } catch (error) {
    const endTime = Date.now();
    delivery.duration = endTime - startTime;
    delivery.status = "failed";
    delivery.error = error instanceof Error ? error.message : "Unknown error";
    if (env.WEBHOOKS) {
      await env.WEBHOOKS.put(`${WEBHOOK_DELIVERY_PREFIX}${deliveryId}`, JSON.stringify(delivery));
      await addDeliveryToIndex(env, deliveryId);
    }
    if (event.attempts < event.maxAttempts) {
      event.status = "pending";
      event.attempts++;
      event.nextRetry = Date.now() + WEBHOOK_CONFIG.RETRY_DELAY * Math.pow(2, event.attempts - 1);
      event.lastAttempt = endTime;
      if (env.WEBHOOKS) {
        await env.WEBHOOKS.put(`${WEBHOOK_EVENT_PREFIX}${eventId}`, JSON.stringify(event));
      }
    } else {
      event.status = "failed";
      event.lastAttempt = endTime;
      if (env.WEBHOOKS) {
        await env.WEBHOOKS.put(`${WEBHOOK_EVENT_PREFIX}${eventId}`, JSON.stringify(event));
      }
    }
    return false;
  }
}
__name(deliverWebhook, "deliverWebhook");
async function processWebhookEvents(env) {
  if (!WEBHOOK_CONFIG.ENABLED || !env.WEBHOOKS) {
    return;
  }
  const now = Date.now();
  const eventsToProcess = [];
  const eventIndex = await getEventIndex(env);
  for (const eventId of eventIndex) {
    const eventData = await env.WEBHOOKS.get(`${WEBHOOK_EVENT_PREFIX}${eventId}`, "json");
    if (eventData) {
      const event = eventData;
      if (event.status === "pending" && (!event.nextRetry || now >= event.nextRetry)) {
        eventsToProcess.push(event);
      }
    }
  }
  for (const event of eventsToProcess) {
    try {
      await deliverWebhook(env, event.webhookId, event.id);
    } catch (error) {
      console.error(`Failed to process webhook event ${event.id}:`, error);
    }
  }
}
__name(processWebhookEvents, "processWebhookEvents");
async function cleanupWebhookData(env) {
  if (!env.WEBHOOKS) return;
  const now = Date.now();
  const maxAge = WEBHOOK_CONFIG.MAX_EVENT_AGE;
  const eventIndex = await getEventIndex(env);
  const eventsToDelete = [];
  for (const eventId of eventIndex) {
    const eventData = await env.WEBHOOKS.get(`${WEBHOOK_EVENT_PREFIX}${eventId}`, "json");
    if (eventData) {
      const event = eventData;
      if (now - event.createdAt > maxAge) {
        await env.WEBHOOKS.delete(`${WEBHOOK_EVENT_PREFIX}${eventId}`);
        eventsToDelete.push(eventId);
      }
    }
  }
  const newEventIndex = eventIndex.filter((id) => !eventsToDelete.includes(id));
  await env.WEBHOOKS.put(WEBHOOK_EVENT_INDEX_KEY, JSON.stringify(newEventIndex));
  const deliveryIndex = await getDeliveryIndex(env);
  const deliveriesToDelete = [];
  for (const deliveryId of deliveryIndex) {
    const deliveryData = await env.WEBHOOKS.get(`${WEBHOOK_DELIVERY_PREFIX}${deliveryId}`, "json");
    if (deliveryData) {
      const delivery = deliveryData;
      if (now - delivery.attemptedAt > maxAge) {
        await env.WEBHOOKS.delete(`${WEBHOOK_DELIVERY_PREFIX}${deliveryId}`);
        deliveriesToDelete.push(deliveryId);
      }
    }
  }
  const newDeliveryIndex = deliveryIndex.filter((id) => !deliveriesToDelete.includes(id));
  await env.WEBHOOKS.put(WEBHOOK_DELIVERY_INDEX_KEY, JSON.stringify(newDeliveryIndex));
}
__name(cleanupWebhookData, "cleanupWebhookData");
function initializeWebhookProcessing(env) {
  if (webhookProcessingInitialized) {
    return;
  }
  if (!WEBHOOK_CONFIG.ENABLED) {
    return;
  }
  webhookProcessingInitialized = true;
  setInterval(() => {
    processWebhookEvents(env).catch((error) => {
      console.error("Webhook processing failed:", error);
    });
  }, 3e4);
  setInterval(() => {
    cleanupWebhookData(env).catch((error) => {
      console.error("Webhook cleanup failed:", error);
    });
  }, 60 * 60 * 1e3);
}
__name(initializeWebhookProcessing, "initializeWebhookProcessing");
async function createWebhook(env, config) {
  const webhookIndex = await getWebhookIndex(env);
  if (webhookIndex.length >= WEBHOOK_CONFIG.MAX_WEBHOOKS) {
    throw new Error("Maximum number of webhooks reached");
  }
  const webhookId = generateWebhookId();
  const webhook = {
    ...config,
    createdAt: Date.now(),
    lastDelivery: void 0,
    failureCount: 0,
    maxFailures: 5
  };
  await setWebhookConfig(env, webhookId, webhook);
  return webhookId;
}
__name(createWebhook, "createWebhook");
async function getAllWebhooks(env) {
  const webhookIndex = await getWebhookIndex(env);
  const webhooks = /* @__PURE__ */ new Map();
  for (const webhookId of webhookIndex) {
    const webhook = await getWebhookConfig(env, webhookId);
    if (webhook) {
      webhooks.set(webhookId, webhook);
    }
  }
  return webhooks;
}
__name(getAllWebhooks, "getAllWebhooks");
async function getWebhookEvents(env, webhookId) {
  if (!env.WEBHOOKS) return [];
  const eventIndex = await getEventIndex(env);
  const events = [];
  for (const eventId of eventIndex) {
    const eventData = await env.WEBHOOKS.get(`${WEBHOOK_EVENT_PREFIX}${eventId}`, "json");
    if (eventData) {
      const event = eventData;
      if (!webhookId || event.webhookId === webhookId) {
        events.push(event);
      }
    }
  }
  return events;
}
__name(getWebhookEvents, "getWebhookEvents");
async function getWebhookDeliveries(env, webhookId) {
  if (!env.WEBHOOKS) return [];
  const deliveryIndex = await getDeliveryIndex(env);
  const deliveries = [];
  for (const deliveryId of deliveryIndex) {
    const deliveryData = await env.WEBHOOKS.get(`${WEBHOOK_DELIVERY_PREFIX}${deliveryId}`, "json");
    if (deliveryData) {
      const delivery = deliveryData;
      if (!webhookId || delivery.webhookId === webhookId) {
        deliveries.push(delivery);
      }
    }
  }
  return deliveries;
}
__name(getWebhookDeliveries, "getWebhookDeliveries");

// src/batch.ts
var DEFAULT_BATCH_SIZE = 10;
var MAX_BATCH_SIZE = 100;
var MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024;
async function processBatchLookupWithBatchGeocoding(env, requests, geocodeIfNeeded2, lookupRiding2, geocodeBatchFn, request, circuitBreaker) {
  if (requests.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE} requests`);
  }
  const results = [];
  const rawBatchSize = env.BATCH_SIZE || DEFAULT_BATCH_SIZE;
  const batchSize = Math.max(1, Math.min(Math.floor(rawBatchSize), MAX_BATCH_SIZE));
  incrementMetric("batchRequests");
  const startTime = Date.now();
  try {
    const geocodingNeeded = [];
    const coordinatesProvided = [];
    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      if (req.query.lat !== void 0 && req.query.lon !== void 0) {
        coordinatesProvided.push({
          request: req,
          index: i,
          lon: req.query.lon,
          lat: req.query.lat
        });
      } else {
        geocodingNeeded.push({
          request: req,
          index: i
        });
      }
    }
    const hasGoogleKey = /* @__PURE__ */ __name(() => !!(request?.headers?.get?.("X-Google-API-Key") ?? env.GOOGLE_MAPS_KEY), "hasGoogleKey");
    const resolveNormalized = /* @__PURE__ */ __name(async (lat, lon) => {
      if (!hasGoogleKey()) return void 0;
      const v = await normalizeAddressWithGoogle(env, lat, lon, request, circuitBreaker);
      return v ?? void 0;
    }, "resolveNormalized");
    for (const { request: request2, index, lon, lat } of coordinatesProvided) {
      const startTime2 = Date.now();
      try {
        const cacheKey = generateLookupCacheKey({ ...request2.query, lon, lat }, request2.pathname);
        const cachedResult = await getCachedLookupResult(env, cacheKey);
        let normalizedAddress = cachedResult?.normalizedAddress;
        if (cachedResult) {
          if (normalizedAddress === void 0 && hasGoogleKey()) normalizedAddress = await resolveNormalized(lat, lon);
          const processingTime = Date.now() - startTime2;
          results[index] = {
            id: request2.id,
            query: request2.query,
            point: { lon, lat },
            properties: cachedResult.properties,
            ...normalizedAddress && { normalizedAddress },
            processingTime
          };
        } else {
          const result = await lookupRiding2(env, request2.pathname, lon, lat);
          if (hasGoogleKey()) normalizedAddress = await resolveNormalized(lat, lon);
          const processingTime = Date.now() - startTime2;
          const { r2Key } = pickDataset(request2.pathname);
          const dataset = r2Key.replace(".geojson", "");
          const toCache = { ...result, ...normalizedAddress && { normalizedAddress } };
          await setCachedLookupResult(env, cacheKey, toCache, dataset, { lon, lat });
          results[index] = {
            id: request2.id,
            query: request2.query,
            point: { lon, lat },
            properties: result.properties,
            ...normalizedAddress && { normalizedAddress },
            processingTime
          };
        }
      } catch (error) {
        const processingTime = Date.now() - startTime2;
        results[index] = {
          id: request2.id,
          query: request2.query,
          properties: null,
          error: error instanceof Error ? error.message : "Lookup failed",
          processingTime
        };
      }
    }
    if (geocodingNeeded.length > 0) {
      const queries = geocodingNeeded.map((item) => item.request.query);
      const geocodingResults = await geocodeBatchFn(env, queries, request, circuitBreaker);
      for (let i = 0; i < geocodingNeeded.length; i++) {
        const { request: request2, index } = geocodingNeeded[i];
        const geocodingResult = geocodingResults[i];
        const startTime2 = Date.now();
        if (geocodingResult.success) {
          try {
            const cacheKey = generateLookupCacheKey(
              { ...request2.query, lon: geocodingResult.lon, lat: geocodingResult.lat },
              request2.pathname
            );
            const cachedResult = await getCachedLookupResult(env, cacheKey);
            let normalizedAddress = geocodingResult.normalizedAddress ?? cachedResult?.normalizedAddress;
            if (normalizedAddress === void 0 && hasGoogleKey()) {
              normalizedAddress = await resolveNormalized(geocodingResult.lat, geocodingResult.lon);
            }
            if (cachedResult) {
              const processingTime = Date.now() - startTime2;
              results[index] = {
                id: request2.id,
                query: request2.query,
                point: { lon: geocodingResult.lon, lat: geocodingResult.lat },
                properties: cachedResult.properties,
                ...normalizedAddress && { normalizedAddress },
                processingTime
              };
            } else {
              const result = await lookupRiding2(env, request2.pathname, geocodingResult.lon, geocodingResult.lat);
              const processingTime = Date.now() - startTime2;
              const { r2Key } = pickDataset(request2.pathname);
              const dataset = r2Key.replace(".geojson", "");
              const toCache = { ...result, ...normalizedAddress && { normalizedAddress } };
              await setCachedLookupResult(env, cacheKey, toCache, dataset, { lon: geocodingResult.lon, lat: geocodingResult.lat });
              results[index] = {
                id: request2.id,
                query: request2.query,
                point: { lon: geocodingResult.lon, lat: geocodingResult.lat },
                properties: result.properties,
                ...normalizedAddress && { normalizedAddress },
                processingTime
              };
            }
          } catch (error) {
            const processingTime = Date.now() - startTime2;
            results[index] = {
              id: request2.id,
              query: request2.query,
              properties: null,
              error: error instanceof Error ? error.message : "Lookup failed",
              processingTime
            };
          }
        } else {
          const processingTime = Date.now() - startTime2;
          results[index] = {
            id: request2.id,
            query: request2.query,
            properties: null,
            error: geocodingResult.error || "Geocoding failed",
            processingTime
          };
        }
      }
    }
    recordTiming("totalBatchTime", Date.now() - startTime);
    return results;
  } catch (error) {
    incrementMetric("batchErrors");
    recordTiming("totalBatchTime", Date.now() - startTime);
    throw error;
  }
}
__name(processBatchLookupWithBatchGeocoding, "processBatchLookupWithBatchGeocoding");
async function submitBatchToQueue(env, requests) {
  if (requests.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE} requests`);
  }
  if (!env.QUEUE_MANAGER) {
    throw new Error("Queue manager not configured");
  }
  const queueManagerId = env.QUEUE_MANAGER.idFromName("main-queue");
  const queueManager = env.QUEUE_MANAGER.get(queueManagerId);
  const response = await queueManager.fetch(new Request("https://queue.local/queue/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests })
  }));
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to submit batch to queue");
  }
  return await response.json();
}
__name(submitBatchToQueue, "submitBatchToQueue");
async function getBatchStatus(env, batchId) {
  if (!env.QUEUE_MANAGER) {
    throw new Error("Queue manager not configured");
  }
  const queueManagerId = env.QUEUE_MANAGER.idFromName("main-queue");
  const queueManager = env.QUEUE_MANAGER.get(queueManagerId);
  const response = await queueManager.fetch(new Request(`https://queue.local/queue/status?batchId=${batchId}`));
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get batch status");
  }
  return await response.json();
}
__name(getBatchStatus, "getBatchStatus");
async function processQueueJobs(env, maxJobs = 10) {
  if (!env.QUEUE_MANAGER) {
    throw new Error("Queue manager not configured");
  }
  const queueManagerId = env.QUEUE_MANAGER.idFromName("main-queue");
  const queueManager = env.QUEUE_MANAGER.get(queueManagerId);
  const response = await queueManager.fetch(new Request("https://queue.local/queue/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maxJobs })
  }));
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to process queue jobs");
  }
  return await response.json();
}
__name(processQueueJobs, "processQueueJobs");

// src/queue-manager.ts
var QueueManager = class {
  static {
    __name(this, "QueueManager");
  }
  state;
  env;
  jobs = /* @__PURE__ */ new Map();
  batches = /* @__PURE__ */ new Map();
  processingQueue = [];
  retryQueue = [];
  deadLetterQueue = [];
  priorityQueues = /* @__PURE__ */ new Map();
  stats = {
    totalJobs: 0,
    pendingJobs: 0,
    processingJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    retryingJobs: 0,
    deadLetterJobs: 0,
    averageProcessingTime: 0,
    successRate: 0,
    priorityDistribution: {},
    errorRate: 0,
    throughput: 0,
    oldestPendingJob: 0,
    deadLetterQueueSize: 0,
    retryQueueSize: 0
  };
  lastProcessedTime = Date.now();
  processedJobsCount = 0;
  stateLoadPromise = null;
  stateLoaded = false;
  stateLoadError = null;
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.stateLoadPromise = this.loadStateWithRetry();
  }
  // Load state from Durable Object storage with retry logic
  async loadStateWithRetry(maxRetries = 3) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.loadState();
        this.stateLoaded = true;
        this.stateLoadError = null;
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Failed to load queue manager state (attempt ${attempt}/${maxRetries}):`, lastError);
        if (attempt < maxRetries) {
          const delay = 100 * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    this.stateLoadError = lastError;
    console.error("Failed to load queue manager state after all retries. Operating with empty state.", lastError);
  }
  // Load state from Durable Object storage
  async loadState() {
    const stored = await this.state.storage.get("queueState");
    if (stored) {
      this.jobs = new Map(stored.jobs || []);
      this.batches = new Map(stored.batches || []);
      this.processingQueue = stored.processingQueue || [];
      this.retryQueue = stored.retryQueue || [];
      this.deadLetterQueue = stored.deadLetterQueue || [];
      this.priorityQueues = new Map(stored.priorityQueues || []);
      this.lastProcessedTime = stored.lastProcessedTime || Date.now();
      this.processedJobsCount = stored.processedJobsCount || 0;
    }
  }
  // Save state to Durable Object storage
  async saveState() {
    try {
      await this.state.storage.put("queueState", {
        jobs: Array.from(this.jobs.entries()),
        batches: Array.from(this.batches.entries()),
        processingQueue: this.processingQueue,
        retryQueue: this.retryQueue,
        deadLetterQueue: this.deadLetterQueue,
        priorityQueues: Array.from(this.priorityQueues.entries()),
        lastProcessedTime: this.lastProcessedTime,
        processedJobsCount: this.processedJobsCount
      });
    } catch (error) {
      console.error("Error saving queue manager state:", error);
    }
  }
  // Priority queue management
  addToPriorityQueue(jobId, priority) {
    if (!this.priorityQueues.has(priority)) {
      this.priorityQueues.set(priority, []);
    }
    this.priorityQueues.get(priority).push(jobId);
  }
  removeFromPriorityQueue(jobId, priority) {
    const queue = this.priorityQueues.get(priority);
    if (queue) {
      const index = queue.indexOf(jobId);
      if (index > -1) {
        queue.splice(index, 1);
      }
    }
  }
  getNextJobFromPriorityQueues() {
    const priorities = Array.from(this.priorityQueues.keys()).sort((a, b) => b - a);
    for (const priority of priorities) {
      const queue = this.priorityQueues.get(priority);
      if (queue && queue.length > 0) {
        return queue.shift();
      }
    }
    return null;
  }
  // Dead letter queue management
  moveToDeadLetterQueue(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = "dead_letter";
    job.completedAt = Date.now();
    this.removeFromPriorityQueue(jobId, job.priority);
    const retryIndex = this.retryQueue.indexOf(jobId);
    if (retryIndex > -1) {
      this.retryQueue.splice(retryIndex, 1);
    }
    this.deadLetterQueue.push(jobId);
    console.warn(`Job ${jobId} moved to dead letter queue after ${job.attempts} attempts`);
  }
  // Batch optimization
  groupSimilarRequests(requests) {
    const groups = /* @__PURE__ */ new Map();
    for (const request of requests) {
      const key = `${request.pathname}:${this.getQueryPattern(request.query)}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(request);
    }
    return groups;
  }
  getQueryPattern(query) {
    if (query.lat !== void 0 && query.lon !== void 0) {
      return "coordinates";
    } else if (query.postal) {
      return "postal";
    } else if (query.address) {
      return "address";
    } else {
      return "mixed";
    }
  }
  async fetch(request) {
    if (this.stateLoadPromise) {
      try {
        await this.stateLoadPromise;
      } catch (error) {
        console.error("State load failed in fetch handler:", error);
      } finally {
        this.stateLoadPromise = null;
      }
    }
    if (this.stateLoadError && !this.stateLoaded) {
      console.warn("Queue manager operating with empty state due to load failure. Previous jobs/batches may not be visible.");
    }
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      switch (path) {
        case "/queue/submit":
          return await this.handleSubmitBatch(request);
        case "/queue/status":
          return await this.handleGetStatus(request);
        case "/queue/job":
          return await this.handleGetJob(request);
        case "/queue/batch":
          return await this.handleGetBatch(request);
        case "/queue/stats":
          return await this.handleGetStats();
        case "/queue/retry":
          return await this.handleRetryFailed(request);
        case "/queue/process":
          return await this.handleProcessJobs(request);
        case "/queue/health":
          return await this.handleHealthCheck();
        case "/queue/dead-letter":
          return await this.handleDeadLetterQueue(request);
        case "/queue/retry-dead-letter":
          return await this.handleRetryDeadLetterJobs(request);
        default:
          return new Response("Not found", { status: 404 });
      }
    } catch (error) {
      console.error("Queue manager error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
  async handleSubmitBatch(request) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Request body too large. Maximum size is 10MB" }), {
        status: 413,
        headers: { "Content-Type": "application/json" }
      });
    }
    const body = await request.json();
    const { requests, priority = 1, tags = [] } = body;
    if (!Array.isArray(requests) || requests.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid requests array" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const MAX_BATCH_SIZE2 = 100;
    if (requests.length > MAX_BATCH_SIZE2) {
      return new Response(JSON.stringify({ error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE2} requests` }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const batchJob = {
      id: batchId,
      status: "pending",
      totalJobs: requests.length,
      completedJobs: 0,
      failedJobs: 0,
      createdAt: Date.now(),
      results: [],
      errors: []
    };
    const groupedRequests = this.groupSimilarRequests(requests);
    const jobIds = [];
    let jobIndex = 0;
    for (const [groupKey, groupRequests] of groupedRequests) {
      for (const req of groupRequests) {
        const jobId = `${batchId}_job_${jobIndex}`;
        const job = {
          id: jobId,
          batchId,
          request: {
            id: req.id || `req_${jobIndex}`,
            query: req.query,
            pathname: req.pathname
          },
          status: "pending",
          priority,
          attempts: 0,
          maxAttempts: 5,
          // Configurable
          createdAt: Date.now(),
          errorCount: 0,
          tags: [...tags, groupKey]
          // Add group key as tag
        };
        this.jobs.set(jobId, job);
        this.addToPriorityQueue(jobId, priority);
        jobIds.push(jobId);
        jobIndex++;
      }
    }
    this.batches.set(batchId, batchJob);
    this.updateStats();
    await this.saveState();
    return new Response(JSON.stringify({
      batchId,
      totalJobs: requests.length,
      groupedJobs: groupedRequests.size,
      status: "submitted",
      message: "Batch submitted successfully with optimization"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  async handleGetStatus(request) {
    const url = new URL(request.url);
    const batchId = url.searchParams.get("batchId");
    const jobId = url.searchParams.get("jobId");
    if (batchId) {
      const batch = this.batches.get(batchId);
      if (!batch) {
        return new Response(JSON.stringify({ error: "Batch not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify(batch), {
        headers: { "Content-Type": "application/json" }
      });
    }
    if (jobId) {
      const job = this.jobs.get(jobId);
      if (!job) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify(job), {
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ error: "Missing batchId or jobId parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  async handleGetJob(request) {
    const url = new URL(request.url);
    const jobId = url.searchParams.get("id");
    if (!jobId) {
      return new Response(JSON.stringify({ error: "Missing job id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const job = this.jobs.get(jobId);
    if (!job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify(job), {
      headers: { "Content-Type": "application/json" }
    });
  }
  async handleGetBatch(request) {
    const url = new URL(request.url);
    const batchId = url.searchParams.get("id");
    if (!batchId) {
      return new Response(JSON.stringify({ error: "Missing batch id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const batch = this.batches.get(batchId);
    if (!batch) {
      return new Response(JSON.stringify({ error: "Batch not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify(batch), {
      headers: { "Content-Type": "application/json" }
    });
  }
  async handleGetStats() {
    this.updateStats();
    return new Response(JSON.stringify(this.stats), {
      headers: { "Content-Type": "application/json" }
    });
  }
  async handleRetryFailed(request) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    const body = await request.json();
    const { jobIds } = body;
    if (!Array.isArray(jobIds)) {
      return new Response(JSON.stringify({ error: "Invalid jobIds array" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    let retriedCount = 0;
    for (const jobId of jobIds) {
      const job = this.jobs.get(jobId);
      if (job && (job.status === "failed" || job.status === "retrying")) {
        job.status = "pending";
        job.attempts = 0;
        job.error = void 0;
        job.nextRetryAt = void 0;
        this.processingQueue.push(jobId);
        retriedCount++;
      }
    }
    this.updateStats();
    await this.saveState();
    return new Response(JSON.stringify({
      message: `Retried ${retriedCount} jobs`,
      retriedCount
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  async handleProcessJobs(request) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    const body = await request.json();
    const rawMaxJobs = body.maxJobs ?? 10;
    const maxJobs = Math.max(1, Math.min(Math.floor(rawMaxJobs), 100));
    const priority = body.priority ?? null;
    const jobsToProcess = [];
    const retryJobs = this.retryQueue.splice(0, Math.min(maxJobs, this.retryQueue.length));
    jobsToProcess.push(...retryJobs);
    const remainingSlots = maxJobs - jobsToProcess.length;
    if (remainingSlots > 0) {
      const priorityJobs = this.getJobsFromPriorityQueues(remainingSlots, priority);
      jobsToProcess.push(...priorityJobs);
    }
    const results = [];
    const startTime = Date.now();
    for (const jobId of jobsToProcess) {
      const job = this.jobs.get(jobId);
      if (!job) continue;
      try {
        job.status = "processing";
        job.startedAt = Date.now();
        job.attempts++;
        const result = await this.processJob(job);
        job.status = "completed";
        job.completedAt = Date.now();
        job.result = result;
        job.processingTime = job.completedAt - job.startedAt;
        job.errorCount = 0;
        const batch = this.batches.get(job.batchId);
        if (batch) {
          batch.completedJobs++;
          batch.results.push(result);
          if (batch.completedJobs + batch.failedJobs >= batch.totalJobs) {
            batch.status = batch.failedJobs > 0 ? "partially_completed" : "completed";
            batch.completedAt = Date.now();
          }
        }
        results.push({ jobId, status: "completed", result, processingTime: job.processingTime });
      } catch (error) {
        job.errorCount++;
        job.lastError = error.message;
        job.completedAt = Date.now();
        if (job.attempts < job.maxAttempts) {
          job.status = "retrying";
          job.nextRetryAt = Date.now() + this.calculateRetryDelay(job.attempts);
          this.retryQueue.push(jobId);
        } else {
          this.moveToDeadLetterQueue(jobId);
        }
        const batch = this.batches.get(job.batchId);
        if (batch) {
          batch.failedJobs++;
          batch.errors.push(`${jobId}: ${error.message}`);
          if (batch.completedJobs + batch.failedJobs >= batch.totalJobs) {
            batch.status = batch.completedJobs > 0 ? "partially_completed" : "failed";
            batch.completedAt = Date.now();
          }
        }
        results.push({ jobId, status: "failed", error: error.message, attempts: job.attempts });
      }
    }
    const processingTime = Date.now() - startTime;
    this.processedJobsCount += results.length;
    this.lastProcessedTime = Date.now();
    this.updateStats();
    await this.saveState();
    return new Response(JSON.stringify({
      processedJobs: results.length,
      processingTime,
      results,
      queueStats: {
        pendingJobs: this.getTotalPendingJobs(),
        retryQueueSize: this.retryQueue.length,
        deadLetterQueueSize: this.deadLetterQueue.length
      }
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  getJobsFromPriorityQueues(maxJobs, specificPriority = null) {
    const jobs = [];
    if (specificPriority !== null) {
      const queue = this.priorityQueues.get(specificPriority);
      if (queue) {
        const availableJobs = queue.splice(0, maxJobs);
        jobs.push(...availableJobs);
      }
    } else {
      const priorities = Array.from(this.priorityQueues.keys()).sort((a, b) => b - a);
      for (const priority of priorities) {
        if (jobs.length >= maxJobs) break;
        const queue = this.priorityQueues.get(priority);
        if (queue && queue.length > 0) {
          const remainingSlots = maxJobs - jobs.length;
          const availableJobs = queue.splice(0, remainingSlots);
          jobs.push(...availableJobs);
        }
      }
    }
    return jobs;
  }
  getTotalPendingJobs() {
    let total = 0;
    for (const queue of this.priorityQueues.values()) {
      total += queue.length;
    }
    return total;
  }
  async handleHealthCheck() {
    const health = {
      status: "healthy",
      timestamp: Date.now(),
      stats: this.stats,
      queueLengths: {
        processing: this.processingQueue.length,
        retry: this.retryQueue.length,
        deadLetter: this.deadLetterQueue.length
      }
    };
    return new Response(JSON.stringify(health), {
      headers: { "Content-Type": "application/json" }
    });
  }
  async processJob(job) {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 1e3 + 100));
    return {
      id: job.request.id,
      query: job.request.query,
      point: { lon: -75.6972, lat: 45.4215 },
      properties: { FED_NUM: "35047", FED_NAME: "Ottawa Centre" },
      processingTime: Date.now() - job.startedAt
    };
  }
  calculateRetryDelay(attempt) {
    return Math.min(1e3 * Math.pow(2, attempt - 1), 3e4);
  }
  updateStats() {
    let totalJobs = 0;
    let pendingJobs = 0;
    let processingJobs = 0;
    let completedJobs = 0;
    let failedJobs = 0;
    let retryingJobs = 0;
    let deadLetterJobs = 0;
    let totalProcessingTime = 0;
    let completedCount = 0;
    let errorCount = 0;
    const priorityDistribution = {};
    let oldestPendingJob = Date.now();
    for (const job of this.jobs.values()) {
      totalJobs++;
      totalProcessingTime += job.processingTime || 0;
      if (job.status === "pending" || job.status === "processing") {
        priorityDistribution[job.priority] = (priorityDistribution[job.priority] || 0) + 1;
        if (job.createdAt < oldestPendingJob) {
          oldestPendingJob = job.createdAt;
        }
      }
      errorCount += job.errorCount || 0;
      switch (job.status) {
        case "pending":
          pendingJobs++;
          break;
        case "processing":
          processingJobs++;
          break;
        case "completed":
          completedJobs++;
          completedCount++;
          break;
        case "failed":
          failedJobs++;
          break;
        case "retrying":
          retryingJobs++;
          break;
        case "dead_letter":
          deadLetterJobs++;
          break;
      }
    }
    const timeSinceLastProcessed = Math.max(Date.now() - this.lastProcessedTime, 1e3);
    const throughput = this.processedJobsCount > 0 && timeSinceLastProcessed > 0 ? this.processedJobsCount * 6e4 / timeSinceLastProcessed : 0;
    this.stats = {
      totalJobs,
      pendingJobs,
      processingJobs,
      completedJobs,
      failedJobs,
      retryingJobs,
      deadLetterJobs,
      averageProcessingTime: completedCount > 0 ? totalProcessingTime / completedCount : 0,
      successRate: totalJobs > 0 ? completedJobs / totalJobs * 100 : 0,
      priorityDistribution,
      errorRate: totalJobs > 0 ? errorCount / totalJobs * 100 : 0,
      throughput,
      oldestPendingJob: oldestPendingJob === Date.now() ? 0 : Date.now() - oldestPendingJob,
      deadLetterQueueSize: this.deadLetterQueue.length,
      retryQueueSize: this.retryQueue.length
    };
  }
  async handleDeadLetterQueue(request) {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const deadLetterJobs = this.deadLetterQueue.slice(offset, offset + limit).map((jobId) => {
      const job = this.jobs.get(jobId);
      if (!job) return null;
      return {
        id: job.id,
        batchId: job.batchId,
        priority: job.priority,
        attempts: job.attempts,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        lastError: job.lastError,
        errorCount: job.errorCount,
        tags: job.tags,
        request: job.request
      };
    }).filter(Boolean);
    return new Response(JSON.stringify({
      deadLetterJobs,
      total: this.deadLetterQueue.length,
      limit,
      offset
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  async handleRetryDeadLetterJobs(request) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    const body = await request.json();
    const { jobIds, resetAttempts = true, newPriority = null } = body;
    if (!Array.isArray(jobIds)) {
      return new Response(JSON.stringify({ error: "Invalid jobIds array" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    let retriedCount = 0;
    const results = [];
    for (const jobId of jobIds) {
      const job = this.jobs.get(jobId);
      if (job && job.status === "dead_letter") {
        job.status = "pending";
        if (resetAttempts) {
          job.attempts = 0;
          job.errorCount = 0;
        }
        job.lastError = void 0;
        job.nextRetryAt = void 0;
        if (newPriority !== null) {
          job.priority = newPriority;
        }
        const deadLetterIndex = this.deadLetterQueue.indexOf(jobId);
        if (deadLetterIndex > -1) {
          this.deadLetterQueue.splice(deadLetterIndex, 1);
        }
        this.addToPriorityQueue(jobId, job.priority);
        retriedCount++;
        results.push({ jobId, status: "retried", priority: job.priority });
      } else {
        results.push({ jobId, status: "not_found_or_not_dead_letter" });
      }
    }
    this.updateStats();
    await this.saveState();
    return new Response(JSON.stringify({
      message: `Retried ${retriedCount} dead letter jobs`,
      retriedCount,
      results
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
};

// src/circuit-breaker-do.ts
var CircuitBreakerDO = class {
  static {
    __name(this, "CircuitBreakerDO");
  }
  state;
  env;
  states;
  failureThreshold;
  recoveryTimeout;
  successThreshold;
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.failureThreshold = 5;
    this.recoveryTimeout = 6e4;
    this.successThreshold = 3;
    this.states = /* @__PURE__ */ new Map();
    this.loadState();
  }
  /**
   * Load circuit breaker state from Durable Object storage.
   */
  async loadState() {
    try {
      const stored = await this.state.storage.get("circuitBreakers");
      if (stored) {
        this.states = stored;
      }
    } catch (error) {
      console.warn("[CircuitBreakerDO] Failed to load state:", error);
    }
  }
  /**
   * Save circuit breaker state to Durable Object storage.
   */
  async saveState() {
    try {
      await this.state.storage.put("circuitBreakers", this.states);
    } catch (error) {
      console.warn("[CircuitBreakerDO] Failed to save state:", error);
    }
  }
  /**
   * Handle success for a circuit breaker key.
   */
  async handleSuccess(key) {
    await this.onSuccess(key);
  }
  /**
   * Handle failure for a circuit breaker key.
   */
  async handleFailure(key) {
    await this.onFailure(key);
  }
  /**
   * Check if circuit breaker allows execution for a key.
   * Returns state info and whether execution should proceed.
   */
  async checkState(key) {
    const state = this.getState(key);
    const now = Date.now();
    if (state.state === "OPEN") {
      if (now - state.lastFailureTime > this.recoveryTimeout) {
        state.state = "HALF_OPEN";
        state.successCount = 0;
        await this.saveState();
        return { allowed: true, state };
      } else {
        return { allowed: false, state };
      }
    }
    return { allowed: true, state };
  }
  /**
   * Get or create circuit breaker state for a key.
   */
  getState(key) {
    if (!this.states.has(key)) {
      this.states.set(key, {
        state: "CLOSED",
        failureCount: 0,
        lastFailureTime: 0,
        successCount: 0,
        nextAttemptTime: 0
      });
    }
    return this.states.get(key);
  }
  /**
   * Handle successful operation.
   */
  async onSuccess(key) {
    const state = this.getState(key);
    state.failureCount = 0;
    if (state.state === "HALF_OPEN") {
      state.successCount++;
      if (state.successCount >= this.successThreshold) {
        state.state = "CLOSED";
      }
    }
    await this.saveState();
  }
  /**
   * Handle failed operation.
   */
  async onFailure(key) {
    const state = this.getState(key);
    state.failureCount++;
    state.lastFailureTime = Date.now();
    state.nextAttemptTime = Date.now() + this.recoveryTimeout;
    if (state.failureCount >= this.failureThreshold) {
      state.state = "OPEN";
    }
    await this.saveState();
  }
  /**
   * Get circuit breaker state for a key.
   */
  async getStateInfo(key) {
    await this.loadState();
    return this.states.get(key) || null;
  }
  /**
   * Get all circuit breaker states.
   */
  async getAllStates() {
    await this.loadState();
    return new Map(this.states);
  }
  /**
   * Reset a specific circuit breaker.
   */
  async reset(key) {
    this.states.delete(key);
    await this.saveState();
  }
  /**
   * Reset all circuit breakers.
   */
  async resetAll() {
    this.states.clear();
    await this.saveState();
  }
  /**
   * Update circuit breaker configuration.
   */
  async updateConfig(failureThreshold, recoveryTimeout, successThreshold) {
    if (failureThreshold !== void 0) this.failureThreshold = failureThreshold;
    if (recoveryTimeout !== void 0) this.recoveryTimeout = recoveryTimeout;
    if (successThreshold !== void 0) this.successThreshold = successThreshold;
  }
  /**
   * Handle HTTP requests to the Durable Object (for monitoring/admin).
   */
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/success" && request.method === "POST") {
      const body = await request.json();
      await this.handleSuccess(body.key);
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    if (path === "/failure" && request.method === "POST") {
      const body = await request.json();
      await this.handleFailure(body.key);
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    if (path === "/check" && request.method === "POST") {
      const body = await request.json();
      const result = await this.checkState(body.key);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" }
      });
    }
    if (path === "/state" && request.method === "GET") {
      const key = url.searchParams.get("key");
      if (key) {
        const state = await this.getStateInfo(key);
        return new Response(JSON.stringify(state), {
          headers: { "Content-Type": "application/json" }
        });
      } else {
        const allStates = await this.getAllStates();
        const statesObj = Object.fromEntries(allStates);
        return new Response(JSON.stringify(statesObj), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/reset" && request.method === "POST") {
      const key = url.searchParams.get("key");
      if (key) {
        await this.reset(key);
        return new Response(JSON.stringify({ success: true, message: `Circuit breaker ${key} reset` }), {
          headers: { "Content-Type": "application/json" }
        });
      } else {
        await this.resetAll();
        return new Response(JSON.stringify({ success: true, message: "All circuit breakers reset" }), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/config" && request.method === "POST") {
      const body = await request.json();
      await this.updateConfig(body.failureThreshold, body.recoveryTimeout, body.successThreshold);
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response("Not found", { status: 404 });
  }
};

// src/docs.ts
function createLandingPage(baseUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Riding Lookup API</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            line-height: 1.5;
            color: #1a1a1a;
            background: #ffffff;
            font-size: 16px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 60px 40px;
        }
        
        h1 {
            font-size: 32px;
            font-weight: 600;
            margin-bottom: 8px;
            letter-spacing: -0.02em;
        }
        
        .subtitle {
            font-size: 18px;
            color: #666;
            margin-bottom: 40px;
            font-weight: 400;
        }
        
        .section {
            margin-bottom: 32px;
        }
        
        .section h2 {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 16px;
            color: #1a1a1a;
        }
        
        .section h3 {
            font-size: 16px;
            font-weight: 600;
            margin: 24px 0 12px 0;
            color: #1a1a1a;
        }
        
        .endpoint {
            background: #f6f8fa;
            border: 1px solid #d0d7de;
            padding: 12px 16px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 14px;
            margin: 8px 0 12px 0;
            border-radius: 6px;
            color: #24292f;
            font-weight: 500;
        }
        
        .example {
            background: #ffffff;
            border: 1px solid #d0d7de;
            border-radius: 6px;
            margin: 16px 0;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
            padding: 16px;
            & h3 {
            margin-left: 16px;
            }
        }
        
        .example-tabs {
            display: flex;
            background: #f6f8fa;
            border-bottom: 1px solid #d0d7de;
            padding: 4px;
        }
        
        .example-tab {
            background: none;
            border: none;
            padding: 8px 16px;
            font-family: inherit;
            font-size: 13px;
            font-weight: 500;
            color: #656d76;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.2s ease;
            flex: 1;
            text-align: center;
        }
        
        .example-tab:hover {
            color: #24292f;
            background: #ffffff;
        }
        
        .example-tab.active {
            color: #24292f;
            background: #ffffff;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        
        .response-tabs {
            display: flex;
            background: #f6f8fa;
            border-top: 1px solid #d0d7de;
            padding: 4px;
            margin-top: 12px;
        }
        
        .response-tab {
            background: none;
            border: none;
            padding: 8px 16px;
            font-family: inherit;
            font-size: 13px;
            font-weight: 500;
            color: #656d76;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.2s ease;
            flex: 1;
            text-align: center;
        }
        
        .response-tab:hover {
            color: #24292f;
            background: #ffffff;
        }
        
        .response-tab.active {
            color: #24292f;
            background: #ffffff;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        
        .response-content {
            display: none;
        }
        
        .response-content.active {
            display: block;
        }
        
        .example-content {
            display: none;
        }
        
        .example-content.active {
            display: block;
        }
        
        .example-code {
            background: #0d1117;
            color: #e6edf3;
            padding: 16px 20px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.5;
            border-radius: 6px;
            overflow-x: auto;
            margin: 0;
            border: 1px solid #30363d;
            position: relative;
        }
        
        .example-code::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 1px;
            background: linear-gradient(90deg, #ff7b72, #79c0ff, #a5d6ff, #ffa657, #f0f6fc);
        }
        
        .datasets {
            list-style: none;
        }
        
        .datasets li {
            padding: 8px 0;
            border-bottom: 1px solid #f0f0f0;
            font-size: 15px;
        }
        
        .datasets li:last-child {
            border-bottom: none;
        }
        
        .datasets strong {
            font-weight: 600;
            color: #1a1a1a;
        }
        
        .links {
            margin-top: 48px;
            padding-top: 32px;
            border-top: 1px solid #e1e5e9;
        }
        
        .links a {
            display: inline-block;
            margin-right: 24px;
            color: #0066cc;
            text-decoration: none;
            font-weight: 500;
            font-size: 15px;
        }
        
        .links a:hover {
            text-decoration: underline;
        }
        
        .note {
            background: #f0f8ff;
            border: 1px solid #b6e3ff;
            border-left: 4px solid #0969da;
            padding: 16px;
            margin: 24px 0;
            font-size: 14px;
            color: #0969da;
            border-radius: 6px;
        }
        
        .note code {
            background: #e1f5fe;
            color: #0969da;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 13px;
        }
        
        .response {
            background: #f8f9fa;
            border: 1px solid #e1e5e9;
            padding: 16px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 13px;
            margin: 8px 0;
            border-radius: 4px;
            overflow-x: auto;
        }
        
        .endpoint-section {
            background: #ffffff;
            border: 1px solid #e1e5e9;
            border-radius: 8px;
            padding: 20px;
            margin: 16px 0;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        
        .endpoint-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
            flex-wrap: wrap;
        }
        
        .endpoint-section .method {
            background: #28a745;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: 600;
            font-size: 12px;
            text-transform: uppercase;
        }
        
        .endpoint-section .method.post {
            background: #007bff;
        }
        
        .endpoint-section .url {
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            background: #f6f8fa;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            color: #24292f;
        }
        
        .endpoint-section .description {
            font-weight: 600;
            color: #1a1a1a;
            font-size: 16px;
        }
        
        .endpoint-section p {
            margin: 8px 0;
            color: #666;
            line-height: 1.5;
        }
        
        .param-list {
            margin: 12px 0;
            padding: 12px;
            background: #f8f9fa;
            border-radius: 6px;
            border-left: 3px solid #007bff;
        }
        
        .param {
            margin: 4px 0;
            font-size: 14px;
        }
        
        .error-codes {
            background: #fff5f5;
            border: 1px solid #fed7d7;
            border-radius: 6px;
            padding: 16px;
            margin: 16px 0;
        }
        
        .error-codes h4 {
            color: #c53030;
            margin: 0 0 12px 0;
            font-size: 16px;
        }
        
        .error-code {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #fed7d7;
        }
        
        .error-code:last-child {
            border-bottom: none;
        }
        
        .error-code-name {
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-weight: 600;
            color: #c53030;
        }
        
        .error-code-desc {
            color: #666;
            font-size: 14px;
        }
        
        .rate-limits {
            background: #f0f8ff;
            border: 1px solid #b6e3ff;
            border-radius: 6px;
            padding: 16px;
            margin: 16px 0;
        }
        
        .rate-limits h4 {
            color: #0969da;
            margin: 0 0 12px 0;
            font-size: 16px;
        }
        
        .rate-limit-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 0;
            border-bottom: 1px solid #b6e3ff;
        }
        
        .rate-limit-item:last-child {
            border-bottom: none;
        }
        
        .rate-limit-type {
            font-weight: 600;
            color: #0969da;
        }
        
        .rate-limit-value {
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            background: #e1f5fe;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Riding Lookup API</h1>
        <p class="subtitle">Find Canadian federal, provincial, and territorial ridings by location</p>
        
        <div class="section">
            <h2>Usage</h2>
            
            <div class="example">
                <h3>Postal Code</h3>
                <div class="endpoint">GET ${baseUrl}/api?postal=K1A 0A6</div>
                <div class="example-tabs">
                    <button class="example-tab active" data-type="curl">curl</button>
                    <button class="example-tab" data-type="fetch">fetch</button>
                    <button class="example-tab" data-type="python">python</button>
                </div>
                <div class="example-content active" data-type="curl">
                    <pre><code class="language-bash">curl "${baseUrl}/api?postal=K1A 0A6"</code></pre>
                </div>
                <div class="example-content" data-type="fetch">
                    <pre><code class="language-javascript">fetch("${baseUrl}/api?postal=K1A 0A6")
  .then(response => response.json())
  .then(data => console.log(data));</code></pre>
                </div>
                <div class="example-content" data-type="python">
                    <pre><code class="language-python">import requests

response = requests.get("${baseUrl}/api", params={"postal": "K1A 0A6"})
data = response.json()
print(data)</code></pre>
                </div>
                
                <div class="response-tabs">
                    <button class="response-tab active" data-type="success">Success</button>
                    <button class="response-tab" data-type="error">Error</button>
                </div>
                <div class="response-content active" data-type="success">
                    <pre><code class="language-json">{
  "query": {"postal": "K1A 0A6"},
  "point": {"lon": -75.6972, "lat": 45.4215},
  "properties": {
    "FED_NUM": "35047",
    "FED_NAME": "Ottawa Centre",
    "PROV_TERR": "Ontario"
  }
}</code></pre>
                </div>
                <div class="response-content" data-type="error">
                    <pre><code class="language-json">{
  "error": "Invalid postal code format",
  "code": "INVALID_POSTAL_CODE"
}</code></pre>
                </div>
            </div>
            
            <div class="example">
                <h3>Address</h3>
                <div class="endpoint">GET ${baseUrl}/api?address=123 Main St Toronto</div>
                <div class="example-tabs">
                    <button class="example-tab active" data-type="curl">curl</button>
                    <button class="example-tab" data-type="fetch">fetch</button>
                    <button class="example-tab" data-type="python">python</button>
                </div>
                <div class="example-content active" data-type="curl">
                    <pre><code class="language-bash">curl "${baseUrl}/api?address=123%20Main%20St%20Toronto"</code></pre>
                </div>
                <div class="example-content" data-type="fetch">
                    <pre><code class="language-javascript">fetch("${baseUrl}/api?address=123%20Main%20St%20Toronto")
  .then(response => response.json())
  .then(data => console.log(data));</code></pre>
                </div>
                <div class="example-content" data-type="python">
                    <pre><code class="language-python">import requests

response = requests.get("${baseUrl}/api", params={"address": "123 Main St Toronto"})
data = response.json()
print(data)</code></pre>
                </div>
                
                <div class="response-tabs">
                    <button class="response-tab active" data-type="success">Success</button>
                    <button class="response-tab" data-type="error">Error</button>
                </div>
                <div class="response-content active" data-type="success">
                    <pre><code class="language-json">{
  "query": {"address": "123 Main St Toronto"},
  "point": {"lon": -79.3832, "lat": 43.6532},
  "properties": {
    "FED_NUM": "35039",
    "FED_NAME": "Toronto Centre",
    "PROV_TERR": "Ontario"
  }
}</code></pre>
                </div>
                <div class="response-content" data-type="error">
                    <pre><code class="language-json">{
  "error": "Address not found",
  "code": "GEOCODING_FAILED"
}</code></pre>
                </div>
            </div>
            
            <div class="example">
                <h3>Coordinates</h3>
                <div class="endpoint">GET ${baseUrl}/api?lat=45.4215&lon=-75.6972</div>
                <div class="example-tabs">
                    <button class="example-tab active" data-type="curl">curl</button>
                    <button class="example-tab" data-type="fetch">fetch</button>
                    <button class="example-tab" data-type="python">python</button>
                </div>
                <div class="example-content active" data-type="curl">
                    <pre><code class="language-bash">curl "${baseUrl}/api?lat=45.4215&lon=-75.6972"</code></pre>
                </div>
                <div class="example-content" data-type="fetch">
                    <pre><code class="language-javascript">fetch("${baseUrl}/api?lat=45.4215&lon=-75.6972")
  .then(response => response.json())
  .then(data => console.log(data));</code></pre>
                </div>
                <div class="example-content" data-type="python">
                    <pre><code class="language-python">import requests

response = requests.get("${baseUrl}/api", params={"lat": 45.4215, "lon": -75.6972})
data = response.json()
print(data)</code></pre>
                </div>
                
                <div class="response-tabs">
                    <button class="response-tab active" data-type="success">Success</button>
                    <button class="response-tab" data-type="error">Error</button>
                </div>
                <div class="response-content active" data-type="success">
                    <pre><code class="language-json">{
  "query": {"lat": 45.4215, "lon": -75.6972},
  "point": {"lon": -75.6972, "lat": 45.4215},
  "properties": {
    "FED_NUM": "35047",
    "FED_NAME": "Ottawa Centre",
    "PROV_TERR": "Ontario"
  }
}</code></pre>
                </div>
                <div class="response-content" data-type="error">
                    <pre><code class="language-json">{
  "error": "Invalid coordinates",
  "code": "INVALID_COORDINATES"
}</code></pre>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>API Endpoints</h2>
            
            <h3>Core Lookup Endpoints</h3>
            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api</span>
                    <span class="description">Federal Riding Lookup</span>
                </div>
                <p>Find the federal riding for any location in Canada. Supports postal codes, addresses, and coordinates. Returns riding information including FED_NUM, FED_NAME, and PROV_TERR.</p>
                <div class="param-list">
                    <div class="param"><strong>postal</strong> - Canadian postal code (e.g., "K1A 0A6")</div>
                    <div class="param"><strong>address</strong> - Full address to geocode</div>
                    <div class="param"><strong>lat/lon</strong> - Latitude and longitude coordinates</div>
                    <div class="param"><strong>city/state/country</strong> - Location components</div>
                </div>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/qc</span>
                    <span class="description">Quebec Provincial Riding Lookup</span>
                </div>
                <p>Find the Quebec provincial riding for any location in Quebec. Uses the 2025 Quebec provincial riding boundaries.</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/on</span>
                    <span class="description">Ontario Provincial Riding Lookup</span>
                </div>
                <p>Find the Ontario provincial riding for any location in Ontario. Uses the 2022 Ontario provincial riding boundaries.</p>
            </div>

            <h3>Batch Processing</h3>
            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">POST</span>
                    <span class="url">/batch</span>
                    <span class="description">Immediate Batch Processing</span>
                </div>
                <p>Process multiple lookup requests immediately using Google Maps batch geocoding for optimal performance. Supports up to 100 requests per batch.</p>
                
                <h4>Example Request</h4>
                <pre><code class="language-bash">curl -X POST "${baseUrl}/batch" \\
  -H "Content-Type: application/json" \\
  -d '{
    "requests": [
      {
        "id": "1",
        "pathname": "/api",
        "query": {"postal": "K1A 0A6"}
      },
      {
        "id": "2", 
        "pathname": "/api",
        "query": {"address": "123 Main St Toronto"}
      }
    ]
  }'</code></pre>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">POST</span>
                    <span class="url">/api/queue/submit</span>
                    <span class="description">Queue Batch for Processing</span>
                </div>
                <p>Submit a batch of requests to the persistent queue for asynchronous processing. Returns immediately with a batch ID for status tracking.</p>
                
                <h4>Example Request</h4>
                <pre><code class="language-bash">curl -X POST "${baseUrl}/api/queue/submit" \\
  -H "Content-Type: application/json" \\
  -d '{
    "requests": [
      {
        "id": "1",
        "pathname": "/api",
        "query": {"postal": "K1A 0A6"}
      },
      {
        "id": "2",
        "pathname": "/api/qc", 
        "query": {"address": "1234 Rue Saint-Denis, Montr\xE9al"}
      }
    ]
  }'</code></pre>
                
                <h4>Example Response</h4>
                <pre><code class="language-json">{
  "batchId": "batch_1234567890",
  "status": "pending",
  "message": "Batch submitted successfully"
}</code></pre>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/queue/status</span>
                    <span class="description">Check Batch Status</span>
                </div>
                <p>Check the status of a queued batch including completion progress and results. Use the batchId returned from queue submission.</p>
                
                <h4>Example Request</h4>
                <pre><code class="language-bash">curl "${baseUrl}/api/queue/status?batchId=batch_1234567890"</code></pre>
                
                <h4>Example Response</h4>
                <pre><code class="language-json">{
  "batchId": "batch_1234567890",
  "status": "completed",
  "progress": {
    "total": 2,
    "completed": 2,
    "failed": 0,
    "pending": 0
  },
  "results": [
    {
      "id": "1",
      "query": {"postal": "K1A 0A6"},
      "point": {"lon": -75.6972, "lat": 45.4215},
      "properties": {
        "FED_NUM": "35047",
        "FED_NAME": "Ottawa Centre",
        "PROV_TERR": "Ontario"
      },
      "processingTime": 150
    }
  ],
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:05Z"
}</code></pre>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/queue/stats</span>
                    <span class="description">Queue Statistics</span>
                </div>
                <p>Get comprehensive statistics about the queue including job counts, processing times, and success rates.</p>
            </div>

            <h3>Database Operations</h3>
            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">POST</span>
                    <span class="url">/api/database/init</span>
                    <span class="description">Initialize Spatial Database</span>
                </div>
                <p>Initialize the spatial database with required tables and indexes for optimal performance.</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">POST</span>
                    <span class="url">/api/database/sync</span>
                    <span class="description">Sync GeoJSON to Database</span>
                </div>
                <p>Synchronize GeoJSON data to the spatial database for faster lookups.</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/database/stats</span>
                    <span class="description">Database Statistics</span>
                </div>
                <p>Get statistics about the spatial database including feature counts and sync status.</p>
            </div>

            <h3>Boundary Data</h3>
            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/boundaries/lookup</span>
                    <span class="description">Lookup Boundaries by Coordinates</span>
                </div>
                <p>Find boundaries using coordinates with optional dataset selection. Useful for direct database queries.</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/boundaries/all</span>
                    <span class="description">Get All Boundaries</span>
                </div>
                <p>Retrieve all boundaries from the database with pagination support.</p>
            </div>

            <h3>System & Monitoring</h3>
            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/health</span>
                    <span class="description">Health Check</span>
                </div>
                <p>Get comprehensive health status including metrics, circuit breakers, and cache warming status.</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/metrics</span>
                    <span class="description">Performance Metrics</span>
                </div>
                <p>Get detailed performance metrics and statistics for monitoring and optimization.</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/cache-warming</span>
                    <span class="description">Cache Warming Status</span>
                </div>
                <p>Get current cache warming status and configuration for performance optimization.</p>
            </div>

            <h3>Webhook Management</h3>
            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET/POST</span>
                    <span class="url">/api/webhooks</span>
                    <span class="description">Webhook Management</span>
                </div>
                <p>List and create webhook configurations for event notifications.</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/webhooks/events</span>
                    <span class="description">Webhook Events</span>
                </div>
                <p>Get webhook events with optional filtering by status and webhook ID.</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/webhooks/deliveries</span>
                    <span class="description">Webhook Deliveries</span>
                </div>
                <p>Get webhook delivery attempts with detailed status information.</p>
            </div>
        </div>

        <div class="section">
            <h2>Datasets</h2>
            <ul class="datasets">
                <li><strong>/api</strong> \u2014 Federal ridings (338 ridings)</li>
                <li><strong>/api/qc</strong> \u2014 Quebec provincial ridings (125 ridings)</li>
                <li><strong>/api/on</strong> \u2014 Ontario provincial ridings (124 ridings)</li>
            </ul>
            <p>Have a dataset you'd like to see supported? <a href="https://github.com/chester-hill-solutions/riding-and-address/issues/new">Open an issue</a> and we'll add it to the list.</p>
            <p>Want to contribute a dataset? <a href="https://github.com/chester-hill-solutions/riding-and-address/blob/main/docs/CONTRIBUTING.md">Read the contribution guidelines</a> and submit a pull request.</p>
        </div>

        <div class="section">
            <h2>Authentication</h2>
            <p>This API supports two authentication methods:</p>
            
            <h3>Basic Authentication</h3>
            <pre><code class="language-bash">curl -u "username:password" "${baseUrl}/api?postal=K1A 0A6"</code></pre>
            
            <h3>Google Maps API Key (BYOK)</h3>
            <p>Use your own Google Maps API key to bypass basic authentication:</p>
            <pre><code class="language-bash">curl -H "X-Google-API-Key: YOUR_KEY" "${baseUrl}/api?address=123 Main St"</code></pre>
            
            <div class="note">
                <strong>Note:</strong> When using the X-Google-API-Key header, basic authentication is automatically bypassed, allowing users to use their own Google API key without needing the configured basic auth credentials.
            </div>
        </div>

        <div class="section">
            <h2>Rate Limiting & Performance</h2>
            <div class="rate-limits">
                <h4>Rate Limits</h4>
                <div class="rate-limit-item">
                    <span class="rate-limit-type">Standard Requests</span>
                    <span class="rate-limit-value">100 requests/minute</span>
                </div>
                <div class="rate-limit-item">
                    <span class="rate-limit-type">Batch Processing</span>
                    <span class="rate-limit-value">10 requests per batch</span>
                </div>
                <div class="rate-limit-item">
                    <span class="rate-limit-type">Queue Processing</span>
                    <span class="rate-limit-value">Unlimited (async)</span>
                </div>
            </div>
            
            <h3>Timeouts</h3>
            <ul>
                <li><strong>Single lookups:</strong> 10s for geocoding, 5s for riding lookup</li>
                <li><strong>Batch operations:</strong> 30s total processing time</li>
                <li><strong>Maximum request timeout:</strong> 60s</li>
            </ul>
        </div>

        <div class="section">
            <h2>Error Codes</h2>
            <div class="error-codes">
                <h4>Common Error Responses</h4>
                <div class="error-code">
                    <span class="error-code-name">INVALID_POSTAL_CODE</span>
                    <span class="error-code-desc">Postal code format is invalid</span>
                </div>
                <div class="error-code">
                    <span class="error-code-name">GEOCODING_FAILED</span>
                    <span class="error-code-desc">Address could not be geocoded</span>
                </div>
                <div class="error-code">
                    <span class="error-code-name">INVALID_COORDINATES</span>
                    <span class="error-code-desc">Latitude/longitude values are invalid</span>
                </div>
                <div class="error-code">
                    <span class="error-code-name">RIDING_NOT_FOUND</span>
                    <span class="error-code-desc">No riding found for the given location</span>
                </div>
                <div class="error-code">
                    <span class="error-code-name">RATE_LIMIT_EXCEEDED</span>
                    <span class="error-code-desc">Too many requests, please slow down</span>
                </div>
                <div class="error-code">
                    <span class="error-code-name">AUTHENTICATION_REQUIRED</span>
                    <span class="error-code-desc">Valid credentials or API key required</span>
                </div>
                <div class="error-code">
                    <span class="error-code-name">BATCH_SIZE_EXCEEDED</span>
                    <span class="error-code-desc">Batch contains too many requests (max 100)</span>
                </div>
                <div class="error-code">
                    <span class="error-code-name">CIRCUIT_BREAKER_OPEN</span>
                    <span class="error-code-desc">Service temporarily unavailable due to high error rate</span>
                </div>
            </div>
        </div>


        <div class="links">
            <a href="${baseUrl}/swagger" target="_blank">API Documentation</a>
            <a href="${baseUrl}/api/docs" target="_blank">OpenAPI Spec</a>
            <a href="https://github.com/chester-hill-solutions/riding-and-address" target="_blank">GitHub</a>
        </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js"><\/script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"><\/script>
    <script>
        // Tab switching functionality
        document.addEventListener('DOMContentLoaded', function() {
            // Initialize Prism syntax highlighting
            if (typeof Prism !== 'undefined') {
                Prism.highlightAll();
            }
            // Get preferred language from URL params, default to curl
            const urlParams = new URLSearchParams(window.location.search);
            const preferredLang = urlParams.get('lang') || 'curl';
            
            // Function to set all examples to a specific language
            function setAllExamplesToLanguage(lang) {
                document.querySelectorAll('.example').forEach(example => {
                    const tabs = example.querySelectorAll('.example-tab');
                    const contents = example.querySelectorAll('.example-content');
                    
                    // Remove active classes
                    tabs.forEach(tab => tab.classList.remove('active'));
                    contents.forEach(content => content.classList.remove('active'));
                    
                    // Set preferred language as active
                    const activeTab = example.querySelector('[data-type="' + lang + '"]');
                    const activeContent = example.querySelector('[data-type="' + lang + '"].example-content');
                    
                    if (activeTab && activeContent) {
                        activeTab.classList.add('active');
                        activeContent.classList.add('active');
                    } else {
                        // Fallback to curl if preferred language not found
                        const curlTab = example.querySelector('[data-type="curl"]');
                        const curlContent = example.querySelector('[data-type="curl"].example-content');
                        if (curlTab && curlContent) {
                            curlTab.classList.add('active');
                            curlContent.classList.add('active');
                        }
                    }
                });
            }
            
            // Initialize with preferred language
            setAllExamplesToLanguage(preferredLang);
            
            // Add click handlers to all example tabs
            document.querySelectorAll('.example-tab').forEach(tab => {
                tab.addEventListener('click', function() {
                    const type = this.getAttribute('data-type');
                    
                    // Update URL with language preference
                    const url = new URL(window.location);
                    url.searchParams.set('lang', type);
                    window.history.replaceState({}, '', url);
                    
                    // Update ALL examples to use the selected language
                    setAllExamplesToLanguage(type);
                    
                    // Re-highlight code after tab switch
                    if (typeof Prism !== 'undefined') {
                        Prism.highlightAll();
                    }
                });
            });
            
            // Add click handlers to all response tabs
            document.querySelectorAll('.response-tab').forEach(tab => {
                tab.addEventListener('click', function() {
                    const example = this.closest('.example');
                    const type = this.getAttribute('data-type');
                    
                    // Update response tabs in this example only
                    example.querySelectorAll('.response-tab').forEach(t => t.classList.remove('active'));
                    example.querySelectorAll('.response-content').forEach(c => c.classList.remove('active'));
                    
                    // Activate selected tab and content
                    this.classList.add('active');
                    example.querySelector('[data-type="' + type + '"].response-content').classList.add('active');
                    
                    // Re-highlight code after response tab switch
                    if (typeof Prism !== 'undefined') {
                        Prism.highlightAll();
                    }
                });
            });
        });
    <\/script>
</body>
</html>`;
}
__name(createLandingPage, "createLandingPage");
function createSwaggerUI(baseUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Riding Lookup API - Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui.css" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css">
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin:0;
      background: #fafafa;
    }
    .swagger-ui .topbar {
      display: none;
    }
.swagger-ui .wrapper span:last-child div.opblock-tag-section:last-child {
      padding-top: 0;
      padding-bottom: 40px;
    }
}
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-bundle.js"><\/script>
  <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-standalone-preset.js"><\/script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '${baseUrl}/api/docs',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  <\/script>
</body>
</html>`;
}
__name(createSwaggerUI, "createSwaggerUI");
function createOpenAPISpec(baseUrl) {
  return {
    openapi: "3.0.0",
    info: {
      title: "Riding Lookup API",
      description: "Find Canadian federal, provincial, and territorial ridings by location. Uses GeoGratis Geolocation API (Government of Canada) as the primary geocoding service, with automatic fallback to Google Maps (BYOK), Mapbox, or Nominatim when needed. Features Google Maps batch geocoding for optimal performance and cost efficiency. Built on Cloudflare Workers for global edge performance.",
      version: "1.0.0",
      contact: {
        name: "API Support",
        url: "https://github.com",
        email: "support@example.com"
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT"
      }
    },
    servers: [
      {
        url: baseUrl,
        description: "Production server"
      }
    ],
    paths: {
      "/api": {
        get: {
          summary: "Lookup federal riding by location",
          description: "Find the federal riding for a given location using postal code, address, or coordinates",
          tags: ["Federal Ridings"],
          parameters: [
            {
              name: "postal",
              in: "query",
              description: "Canadian postal code (e.g., K1A 0A6)",
              required: false,
              schema: { type: "string", example: "K1A 0A6" }
            },
            {
              name: "address",
              in: "query",
              description: "Street address",
              required: false,
              schema: { type: "string", example: "123 Main St, Toronto, ON" }
            },
            {
              name: "lat",
              in: "query",
              description: "Latitude",
              required: false,
              schema: { type: "number", example: 45.4215 }
            },
            {
              name: "lon",
              in: "query",
              description: "Longitude",
              required: false,
              schema: { type: "number", example: -75.6972 }
            },
            {
              name: "city",
              in: "query",
              description: "City name",
              required: false,
              schema: { type: "string", example: "Toronto" }
            },
            {
              name: "state",
              in: "query",
              description: "Province or state",
              required: false,
              schema: { type: "string", example: "Ontario" }
            },
            {
              name: "country",
              in: "query",
              description: "Country",
              required: false,
              schema: { type: "string", example: "Canada" }
            }
          ],
          responses: {
            "200": {
              description: "Successful lookup",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      query: {
                        type: "object",
                        description: "The query parameters used"
                      },
                      point: {
                        type: "object",
                        properties: {
                          lon: { type: "number" },
                          lat: { type: "number" }
                        },
                        description: "Geocoded coordinates"
                      },
                      properties: {
                        type: "object",
                        description: "Riding properties including FED_NUM, FED_NAME, etc.",
                        nullable: true
                      }
                    }
                  },
                  example: {
                    query: { postal: "K1A 0A6" },
                    point: { lon: -75.6972, lat: 45.4215 },
                    properties: {
                      FED_NUM: "35047",
                      FED_NAME: "Ottawa Centre",
                      PROV_TERR: "Ontario"
                    }
                  }
                }
              }
            },
            "400": {
              description: "Bad request - invalid parameters",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" }
                    }
                  }
                }
              }
            },
            "401": {
              description: "Unauthorized - missing or invalid authentication",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" }
                    }
                  }
                }
              }
            },
            "429": {
              description: "Rate limit exceeded",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      retryAfter: { type: "number" }
                    }
                  }
                }
              }
            }
          },
          security: [{ basicAuth: [] }, { apiKey: [] }]
        }
      },
      "/api/qc": {
        get: {
          summary: "Lookup Quebec provincial riding by location",
          description: "Find the Quebec provincial riding for a given location",
          tags: ["Quebec Ridings"],
          parameters: [
            {
              name: "postal",
              in: "query",
              description: "Canadian postal code (e.g., H2Y 1C6)",
              required: false,
              schema: { type: "string", example: "H2Y 1C6" }
            },
            {
              name: "address",
              in: "query",
              description: "Street address",
              required: false,
              schema: {
                type: "string",
                example: "1234 Rue Saint-Denis, Montr\xE9al, QC"
              }
            },
            {
              name: "lat",
              in: "query",
              description: "Latitude",
              required: false,
              schema: { type: "number", example: 45.5017 }
            },
            {
              name: "lon",
              in: "query",
              description: "Longitude",
              required: false,
              schema: { type: "number", example: -73.5673 }
            }
          ],
          responses: {
            "200": {
              description: "Successful lookup",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      query: { type: "object" },
                      point: {
                        type: "object",
                        properties: {
                          lon: { type: "number" },
                          lat: { type: "number" }
                        }
                      },
                      properties: {
                        type: "object",
                        nullable: true
                      }
                    }
                  }
                }
              }
            }
          },
          security: [{ basicAuth: [] }, { apiKey: [] }]
        }
      },
      "/api/on": {
        get: {
          summary: "Lookup Ontario provincial riding by location",
          description: "Find the Ontario provincial riding for a given location",
          tags: ["Ontario Ridings"],
          parameters: [
            {
              name: "postal",
              in: "query",
              description: "Canadian postal code (e.g., M5H 2N2)",
              required: false,
              schema: { type: "string", example: "M5H 2N2" }
            },
            {
              name: "address",
              in: "query",
              description: "Street address",
              required: false,
              schema: { type: "string", example: "123 King St, Toronto, ON" }
            },
            {
              name: "lat",
              in: "query",
              description: "Latitude",
              required: false,
              schema: { type: "number", example: 43.6532 }
            },
            {
              name: "lon",
              in: "query",
              description: "Longitude",
              required: false,
              schema: { type: "number", example: -79.3832 }
            }
          ],
          responses: {
            "200": {
              description: "Successful lookup",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      query: { type: "object" },
                      point: {
                        type: "object",
                        properties: {
                          lon: { type: "number" },
                          lat: { type: "number" }
                        }
                      },
                      properties: {
                        type: "object",
                        nullable: true
                      }
                    }
                  }
                }
              }
            }
          },
          security: [{ basicAuth: [] }, { apiKey: [] }]
        }
      },
      "/batch": {
        post: {
          summary: "Process batch of lookup requests",
          description: "Process multiple lookup requests in a single call",
          tags: ["Batch Processing"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    requests: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          pathname: {
                            type: "string",
                            enum: ["/api", "/api/qc", "/api/on"]
                          },
                          query: {
                            type: "object",
                            properties: {
                              postal: { type: "string" },
                              address: { type: "string" },
                              lat: { type: "number" },
                              lon: { type: "number" },
                              city: { type: "string" },
                              state: { type: "string" },
                              country: { type: "string" }
                            }
                          }
                        },
                        required: ["id", "pathname", "query"]
                      }
                    }
                  },
                  required: ["requests"]
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Batch processing completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      results: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            query: { type: "object" },
                            point: { type: "object", nullable: true },
                            properties: { type: "object", nullable: true },
                            error: { type: "string" },
                            processingTime: { type: "number" }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          security: [{ basicAuth: [] }, { apiKey: [] }]
        }
      },
      "/api/queue/submit": {
        post: {
          summary: "Submit Batch to Queue",
          description: "Submit a batch of riding lookups to the persistent queue for asynchronous processing. Returns immediately with batch ID for status tracking.",
          tags: ["Queue Operations"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    requests: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          pathname: {
                            type: "string",
                            enum: ["/api", "/api/qc", "/api/on"]
                          },
                          query: {
                            type: "object",
                            properties: {
                              postal: { type: "string" },
                              address: { type: "string" },
                              lat: { type: "number" },
                              lon: { type: "number" },
                              city: { type: "string" },
                              state: { type: "string" },
                              country: { type: "string" }
                            }
                          }
                        },
                        required: ["id", "pathname", "query"]
                      }
                    }
                  },
                  required: ["requests"]
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Batch submitted successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      batchId: { type: "string" },
                      status: { type: "string" },
                      message: { type: "string" }
                    }
                  }
                }
              }
            }
          },
          security: [{ basicAuth: [] }, { apiKey: [] }]
        }
      },
      "/api/queue/status": {
        get: {
          summary: "Get Batch Status",
          description: "Check the status of a submitted batch job including completion progress and results.",
          tags: ["Queue Operations"],
          parameters: [
            {
              name: "batchId",
              in: "query",
              description: "The batch ID returned from queue submission",
              required: true,
              schema: { type: "string" }
            }
          ],
          responses: {
            "200": {
              description: "Batch status retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      batchId: { type: "string" },
                      status: {
                        type: "string",
                        enum: ["pending", "processing", "completed", "failed"]
                      },
                      progress: {
                        type: "object",
                        properties: {
                          total: { type: "number" },
                          completed: { type: "number" },
                          failed: { type: "number" },
                          pending: { type: "number" }
                        }
                      },
                      results: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            query: { type: "object" },
                            point: { type: "object", nullable: true },
                            properties: { type: "object", nullable: true },
                            error: { type: "string" },
                            processingTime: { type: "number" }
                          }
                        }
                      },
                      createdAt: { type: "string", format: "date-time" },
                      updatedAt: { type: "string", format: "date-time" }
                    }
                  }
                }
              }
            }
          },
          security: [{ basicAuth: [] }, { apiKey: [] }]
        }
      },
      "/api/queue/stats": {
        get: {
          summary: "Get Queue Statistics",
          description: "Get comprehensive statistics about the queue including job counts, processing times, and success rates.",
          tags: ["Queue Operations"],
          responses: {
            "200": {
              description: "Queue statistics retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      totalBatches: { type: "number" },
                      pendingBatches: { type: "number" },
                      processingBatches: { type: "number" },
                      completedBatches: { type: "number" },
                      failedBatches: { type: "number" },
                      totalJobs: { type: "number" },
                      pendingJobs: { type: "number" },
                      completedJobs: { type: "number" },
                      failedJobs: { type: "number" },
                      averageProcessingTime: { type: "number" },
                      successRate: { type: "number" },
                      lastUpdated: { type: "string", format: "date-time" }
                    }
                  }
                }
              }
            }
          },
          security: [{ basicAuth: [] }, { apiKey: [] }]
        }
      },
      "/api/queue/process": {
        post: {
          summary: "Process Queue Jobs",
          description: "Process pending jobs from the queue. This endpoint is typically called by worker processes.",
          tags: ["Queue Operations"],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    maxJobs: {
                      type: "number",
                      description: "Maximum number of jobs to process (default: 10)",
                      default: 10
                    }
                  }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Queue processing completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      processed: { type: "number" },
                      successful: { type: "number" },
                      failed: { type: "number" },
                      results: { type: "array" }
                    }
                  }
                }
              }
            }
          },
          security: [{ basicAuth: [] }, { apiKey: [] }]
        }
      },
      "/api/database/init": {
        post: {
          summary: "Initialize Spatial Database",
          description: "Initialize the spatial database with required tables and indexes",
          tags: ["Database Operations"],
          responses: {
            "200": {
              description: "Database initialization completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" }
                    }
                  }
                }
              }
            }
          },
          security: [{ basicAuth: [] }]
        }
      },
      "/api/database/sync": {
        post: {
          summary: "Sync GeoJSON to Database",
          description: "Synchronize GeoJSON data to the spatial database",
          tags: ["Database Operations"],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    dataset: {
                      type: "string",
                      enum: [
                        "federalridings-2024.geojson",
                        "quebecridings-2025.geojson",
                        "ontarioridings-2022.geojson"
                      ],
                      default: "federalridings-2024.geojson"
                    }
                  }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Database sync completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      dataset: { type: "string" }
                    }
                  }
                }
              }
            }
          },
          security: [{ basicAuth: [] }]
        }
      },
      "/api/database/stats": {
        get: {
          summary: "Get Database Statistics",
          description: "Get statistics about the spatial database",
          tags: ["Database Operations"],
          responses: {
            "200": {
              description: "Database statistics retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      enabled: { type: "boolean" },
                      features: { type: "number" },
                      lastSync: {
                        type: "string",
                        format: "date-time",
                        nullable: true
                      },
                      status: { type: "string", enum: ["active", "disabled"] }
                    }
                  }
                }
              }
            }
          },
          security: [{ basicAuth: [] }]
        }
      },
      "/api/database/query": {
        get: {
          summary: "Query Database Directly",
          description: "Query the spatial database directly by coordinates",
          tags: ["Database Operations"],
          parameters: [
            {
              name: "lat",
              in: "query",
              description: "Latitude",
              required: true,
              schema: { type: "number", example: 45.4215 }
            },
            {
              name: "lon",
              in: "query",
              description: "Longitude",
              required: true,
              schema: { type: "number", example: -75.6972 }
            },
            {
              name: "dataset",
              in: "query",
              description: "Dataset to query",
              required: false,
              schema: {
                type: "string",
                enum: [
                  "federalridings-2024.geojson",
                  "quebecridings-2025.geojson",
                  "ontarioridings-2022.geojson"
                ],
                default: "federalridings-2024.geojson"
              }
            }
          ],
          responses: {
            "200": {
              description: "Database query successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      type: { type: "string" },
                      properties: { type: "object" },
                      geometry: { type: "object" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/boundaries/lookup": {
        get: {
          summary: "Lookup Boundaries by Coordinates",
          description: "Find boundaries using coordinates with optional dataset selection",
          tags: ["Boundaries"],
          parameters: [
            {
              name: "lat",
              in: "query",
              description: "Latitude",
              required: true,
              schema: { type: "number", example: 45.4215 }
            },
            {
              name: "lon",
              in: "query",
              description: "Longitude",
              required: true,
              schema: { type: "number", example: -75.6972 }
            },
            {
              name: "dataset",
              in: "query",
              description: "Dataset to search",
              required: false,
              schema: {
                type: "string",
                enum: [
                  "federalridings-2024.geojson",
                  "quebecridings-2025.geojson",
                  "ontarioridings-2022.geojson"
                ],
                default: "federalridings-2024.geojson"
              }
            }
          ],
          responses: {
            "200": {
              description: "Boundaries lookup successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      riding: { type: "string" },
                      properties: { type: "object" },
                      source: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/boundaries/all": {
        get: {
          summary: "Get All Boundaries",
          description: "Get all boundaries from the database with pagination",
          tags: ["Boundaries"],
          parameters: [
            {
              name: "dataset",
              in: "query",
              description: "Dataset to retrieve",
              required: false,
              schema: {
                type: "string",
                enum: [
                  "federalridings-2024.geojson",
                  "quebecridings-2025.geojson",
                  "ontarioridings-2022.geojson"
                ],
                default: "federalridings-2024.geojson"
              }
            },
            {
              name: "limit",
              in: "query",
              description: "Number of results to return",
              required: false,
              schema: {
                type: "number",
                default: 100,
                minimum: 1,
                maximum: 1e3
              }
            },
            {
              name: "offset",
              in: "query",
              description: "Number of results to skip",
              required: false,
              schema: { type: "number", default: 0, minimum: 0 }
            }
          ],
          responses: {
            "200": {
              description: "Boundaries retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      features: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            type: { type: "string" },
                            properties: { type: "object" },
                            geometry: { type: "object" }
                          }
                        }
                      },
                      total: { type: "number" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/boundaries/config": {
        get: {
          summary: "Get Boundaries Configuration",
          description: "Get configuration information for boundaries processing",
          tags: ["Boundaries"],
          responses: {
            "200": {
              description: "Boundaries configuration retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      enabled: { type: "boolean" },
                      useRtreeIndex: { type: "boolean" },
                      batchInsertSize: { type: "number" },
                      datasets: {
                        type: "array",
                        items: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/geocoding/batch/status": {
        get: {
          summary: "Get Geocoding Batch Status",
          description: "Get status and configuration of batch geocoding functionality",
          tags: ["Geocoding"],
          responses: {
            "200": {
              description: "Geocoding batch status retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      enabled: { type: "boolean" },
                      maxBatchSize: { type: "number" },
                      timeout: { type: "number" },
                      retryAttempts: { type: "number" },
                      fallbackToIndividual: { type: "boolean" },
                      hasGoogleApiKey: { type: "boolean" },
                      timestamp: { type: "number" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/cache/warm": {
        post: {
          summary: "Trigger Cache Warming",
          description: "Manually trigger cache warming for specified locations",
          tags: ["Cache Management"],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    locations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          lat: { type: "number" },
                          lon: { type: "number" },
                          postal: { type: "string" }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Cache warming initiated",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      locations: { type: "number" },
                      timestamp: { type: "number" }
                    }
                  }
                }
              }
            }
          },
          security: [{ basicAuth: [] }]
        }
      },
      "/api/webhooks": {
        get: {
          summary: "List Webhooks",
          description: "Get list of all configured webhooks",
          tags: ["Webhook Management"],
          responses: {
            "200": {
              description: "Webhooks list retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      webhooks: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            url: { type: "string" },
                            events: {
                              type: "array",
                              items: { type: "string" }
                            },
                            secret: { type: "string", nullable: true },
                            createdAt: { type: "number" },
                            lastDelivery: { type: "number", nullable: true },
                            failureCount: { type: "number" },
                            maxFailures: { type: "number" },
                            active: { type: "boolean" }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          security: [{ basicAuth: [] }]
        },
        post: {
          summary: "Create Webhook",
          description: "Create a new webhook configuration",
          tags: ["Webhook Management"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    url: { type: "string", format: "uri" },
                    events: {
                      type: "array",
                      items: { type: "string" },
                      example: ["batch.completed", "batch.failed"]
                    },
                    secret: {
                      type: "string",
                      description: "Optional webhook secret"
                    }
                  },
                  required: ["url", "events"]
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Webhook created successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      webhookId: { type: "string" },
                      message: { type: "string" }
                    }
                  }
                }
              }
            }
          },
          security: [{ basicAuth: [] }]
        }
      },
      "/api/webhooks/events": {
        get: {
          summary: "Get Webhook Events",
          description: "Get webhook events with optional filtering",
          tags: ["Webhook Management"],
          parameters: [
            {
              name: "status",
              in: "query",
              description: "Filter by event status",
              required: false,
              schema: {
                type: "string",
                enum: ["pending", "delivered", "failed"]
              }
            },
            {
              name: "webhookId",
              in: "query",
              description: "Filter by webhook ID",
              required: false,
              schema: { type: "string" }
            }
          ],
          responses: {
            "200": {
              description: "Webhook events retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      events: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            webhookId: { type: "string" },
                            eventType: { type: "string" },
                            status: { type: "string" },
                            payload: { type: "object" },
                            createdAt: { type: "number" }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          security: [{ basicAuth: [] }]
        }
      },
      "/api/webhooks/deliveries": {
        get: {
          summary: "Get Webhook Deliveries",
          description: "Get webhook delivery attempts with optional filtering",
          tags: ["Webhook Management"],
          parameters: [
            {
              name: "webhookId",
              in: "query",
              description: "Filter by webhook ID",
              required: false,
              schema: { type: "string" }
            },
            {
              name: "status",
              in: "query",
              description: "Filter by delivery status",
              required: false,
              schema: {
                type: "string",
                enum: ["pending", "success", "failed"]
              }
            }
          ],
          responses: {
            "200": {
              description: "Webhook deliveries retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      deliveries: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            webhookId: { type: "string" },
                            eventId: { type: "string" },
                            status: { type: "string" },
                            responseCode: { type: "number", nullable: true },
                            responseBody: { type: "string", nullable: true },
                            attemptCount: { type: "number" },
                            createdAt: { type: "number" }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          security: [{ basicAuth: [] }]
        }
      },
      "/health": {
        get: {
          summary: "Health Check",
          description: "Get comprehensive health status including metrics, circuit breakers, and cache warming status",
          tags: ["System"],
          responses: {
            "200": {
              description: "Health status retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: {
                        type: "string",
                        enum: ["healthy", "unhealthy"]
                      },
                      timestamp: { type: "number" },
                      metrics: { type: "object" },
                      circuitBreakers: { type: "object" },
                      cacheWarming: { type: "object" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/metrics": {
        get: {
          summary: "Get Performance Metrics",
          description: "Get detailed performance metrics and statistics",
          tags: ["System"],
          responses: {
            "200": {
              description: "Metrics retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      requests: {
                        type: "object",
                        properties: {
                          total: { type: "number" },
                          errors: { type: "number" },
                          errorRate: { type: "number" }
                        }
                      },
                      geocoding: { type: "object" },
                      r2: { type: "object" },
                      lookup: { type: "object" },
                      batch: { type: "object" },
                      webhooks: { type: "object" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/cache-warming": {
        get: {
          summary: "Get Cache Warming Status",
          description: "Get current cache warming status and configuration",
          tags: ["Cache Management"],
          responses: {
            "200": {
              description: "Cache warming status retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      isRunning: { type: "boolean" },
                      lastWarmed: { type: "number" },
                      currentBatch: { type: "number" },
                      totalBatches: { type: "number" },
                      successCount: { type: "number" },
                      failureCount: { type: "number" },
                      nextWarmingTime: { type: "number" },
                      config: {
                        type: "object",
                        properties: {
                          enabled: { type: "boolean" },
                          interval: { type: "number" },
                          batchSize: { type: "number" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/webhooks": {
        get: {
          summary: "List Webhooks (Legacy)",
          description: "Legacy endpoint for listing webhooks - use /api/webhooks instead",
          tags: ["Webhook Management"],
          responses: {
            "200": {
              description: "Webhooks list retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      webhooks: {
                        type: "array",
                        items: { type: "object" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/webhooks/events": {
        get: {
          summary: "Get Webhook Events (Legacy)",
          description: "Legacy endpoint for webhook events - use /api/webhooks/events instead",
          tags: ["Webhook Management"],
          responses: {
            "200": {
              description: "Webhook events retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      events: { type: "array" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/webhooks/deliveries": {
        get: {
          summary: "Get Webhook Deliveries (Legacy)",
          description: "Legacy endpoint for webhook deliveries - use /api/webhooks/deliveries instead",
          tags: ["Webhook Management"],
          responses: {
            "200": {
              description: "Webhook deliveries retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      deliveries: { type: "array" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    securitySchemes: {
      basicAuth: {
        type: "http",
        scheme: "basic"
      },
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "X-Google-API-Key",
        description: "Google Maps API key for BYOK authentication"
      }
    },
    tags: [
      {
        name: "Federal Ridings",
        description: "Operations for federal riding lookups"
      },
      {
        name: "Quebec Ridings",
        description: "Operations for Quebec provincial riding lookups"
      },
      {
        name: "Ontario Ridings",
        description: "Operations for Ontario provincial riding lookups"
      },
      {
        name: "Batch Processing",
        description: "Batch processing operations"
      },
      {
        name: "Queue Operations",
        description: "Queue-based batch processing operations"
      },
      {
        name: "Database Operations",
        description: "Spatial database management and operations"
      },
      {
        name: "Boundaries",
        description: "Boundary data access and configuration"
      },
      {
        name: "Geocoding",
        description: "Geocoding service management and status"
      },
      {
        name: "Cache Management",
        description: "Cache warming and management operations"
      },
      {
        name: "Webhook Management",
        description: "Webhook configuration and monitoring"
      },
      {
        name: "System",
        description: "System health and monitoring endpoints"
      }
    ]
  };
}
__name(createOpenAPISpec, "createOpenAPISpec");

// src/worker.ts
async function handleScheduled(event, env, ctx) {
  console.log(`[Cron] Scheduled event triggered: ${event.cron}`);
  try {
    await performCacheWarming(env, async (env2, r2Key) => {
      await loadGeo(env2, r2Key);
    }, lookupRiding);
    console.log("[Cron] Cache warming completed successfully");
  } catch (error) {
    console.error("[Cron] Cache warming failed:", error);
  }
}
__name(handleScheduled, "handleScheduled");
async function lookupRiding(env, pathname, lon, lat) {
  const timeoutConfig = getTimeoutConfig(env);
  const timeoutMs = timeoutConfig.lookup;
  const lookupPromise = (async () => {
    const { r2Key } = pickDataset(pathname);
    const dbConfig = getSpatialDbConfig(env);
    if (dbConfig.ENABLED && env.RIDING_DB) {
      try {
        const dbResult = await queryRidingFromDatabase(env, r2Key, lon, lat);
        if (dbResult) {
          const englishName = dbResult.properties?.ENGLISH_NAME;
          const nameEn = dbResult.properties?.NAME_EN;
          const ridingName = (typeof englishName === "string" ? englishName : null) || (typeof nameEn === "string" ? nameEn : null) || "Unknown";
          return {
            riding: ridingName,
            properties: dbResult.properties || {}
          };
        }
      } catch (error) {
        console.warn("Database lookup failed, falling back to spatial index:", error);
      }
    }
    let spatialIndex = spatialIndexCacheLRU.get(r2Key);
    if (!spatialIndex) {
      await loadGeo(env, r2Key);
      spatialIndex = spatialIndexCacheLRU.get(r2Key);
      if (!spatialIndex) throw new Error(`Failed to create spatial index for ${r2Key}`);
    }
    return lookupRidingWithIndex(spatialIndex, lon, lat);
  })();
  return withTimeout2(lookupPromise, timeoutMs, "Riding lookup");
}
__name(lookupRiding, "lookupRiding");
async function loadGeo(env, key) {
  const startTime = Date.now();
  incrementMetric("r2Requests");
  const cached = geoCacheLRU.get(key);
  if (cached) {
    incrementMetric("r2CacheHits");
    recordTiming("totalR2Time", Date.now() - startTime);
    return cached;
  }
  incrementMetric("r2CacheMisses");
  try {
    const geo = await r2CircuitBreaker.execute(`r2:${key}`, async () => {
      const retryConfig = getRetryConfig();
      return await withRetry2(async () => {
        const obj = await env.RIDINGS.get(key);
        if (!obj) throw new Error(`R2 object not found: ${key}`);
        const text = await obj.text();
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object") {
          throw new Error(`Invalid GeoJSON: not an object`);
        }
        if (parsed.type !== "FeatureCollection") {
          throw new Error(`Invalid GeoJSON: expected FeatureCollection, got ${parsed.type}`);
        }
        if (!Array.isArray(parsed.features)) {
          throw new Error(`Invalid GeoJSON: features must be an array`);
        }
        for (let i = 0; i < Math.min(parsed.features.length, 10); i++) {
          const feature = parsed.features[i];
          if (!feature || typeof feature !== "object") {
            throw new Error(`Invalid GeoJSON: feature ${i} is not an object`);
          }
          if (feature.type !== "Feature") {
            throw new Error(`Invalid GeoJSON: feature ${i} type is not 'Feature'`);
          }
          if (!feature.geometry || typeof feature.geometry !== "object") {
            throw new Error(`Invalid GeoJSON: feature ${i} missing or invalid geometry`);
          }
          if (!feature.geometry.coordinates || !Array.isArray(feature.geometry.coordinates)) {
            throw new Error(`Invalid GeoJSON: feature ${i} missing or invalid coordinates`);
          }
        }
        return parsed;
      }, retryConfig, `R2 fetch ${key}`);
    });
    setCachedGeoJSON(key, geo);
    const spatialIndex = createSpatialIndex(geo);
    setCachedSpatialIndex(key, spatialIndex);
    incrementMetric("r2Successes");
    recordTiming("totalR2Time", Date.now() - startTime);
    return geo;
  } catch (error) {
    incrementMetric("r2Failures");
    if (error instanceof Error && error.message.includes("Circuit breaker is OPEN")) {
      incrementMetric("r2CircuitBreakerTrips");
    }
    recordTiming("totalR2Time", Date.now() - startTime);
    throw error;
  }
}
__name(loadGeo, "loadGeo");
function lookupRidingWithIndex(spatialIndex, lon, lat) {
  const startTime = Date.now();
  if (!isPointInBoundingBox(lon, lat, spatialIndex.boundingBox)) {
    incrementMetric("spatialIndexHits");
    recordTiming("totalSpatialIndexTime", Date.now() - startTime);
    return { properties: null };
  }
  const candidates = findCandidateFeatures(lon, lat, spatialIndex);
  if (candidates.length === 0) {
    incrementMetric("spatialIndexHits");
    recordTiming("totalSpatialIndexTime", Date.now() - startTime);
    return { properties: null };
  }
  incrementMetric("spatialIndexMisses");
  for (const feat of candidates) {
    const props = featurePropertiesIfContains(feat, lon, lat);
    if (props) {
      const englishName = props.ENGLISH_NAME;
      const nameEn = props.NAME_EN;
      const fedName = props.FED_NAME;
      const ridingName = (typeof englishName === "string" ? englishName : null) || (typeof nameEn === "string" ? nameEn : null) || (typeof fedName === "string" ? fedName : null) || void 0;
      recordTiming("totalSpatialIndexTime", Date.now() - startTime);
      return {
        properties: props,
        riding: ridingName
      };
    }
  }
  recordTiming("totalSpatialIndexTime", Date.now() - startTime);
  return { properties: null };
}
__name(lookupRidingWithIndex, "lookupRidingWithIndex");
function featurePropertiesIfContains(ridingFeature, lon, lat) {
  const geom = ridingFeature?.geometry;
  if (!geom) return null;
  if (isPointInPolygon(lon, lat, geom)) {
    return ridingFeature?.properties || {};
  }
  return null;
}
__name(featurePropertiesIfContains, "featurePropertiesIfContains");
var worker_default = {
  async fetch(request, env) {
    const startTime = Date.now();
    const correlationId = getCorrelationId(request);
    incrementMetric("requestCount");
    if (!geocodingCircuitBreaker || !r2CircuitBreaker) {
      initializeCircuitBreakers(env);
    }
    initializeWebhookProcessing(env);
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;
      const getCorsHeaders = /* @__PURE__ */ __name((origin) => {
        const allowedOrigin = origin || "*";
        return {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Google-API-Key, X-Correlation-ID, X-Request-ID",
          "Access-Control-Max-Age": "86400",
          "X-Correlation-ID": correlationId
        };
      }, "getCorsHeaders");
      if (request.method === "OPTIONS") {
        const origin = request.headers.get("Origin");
        return new Response(null, {
          status: 200,
          headers: getCorsHeaders(origin)
        });
      }
      if (pathname === "/") {
        const baseUrl = `${url.protocol}//${url.host}`;
        return new Response(createLandingPage(baseUrl), {
          headers: {
            "content-type": "text/html; charset=UTF-8",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      if (pathname === "/api/docs") {
        const baseUrl = `${url.protocol}//${url.host}`;
        return new Response(JSON.stringify(createOpenAPISpec(baseUrl)), {
          headers: {
            "content-type": "application/json; charset=UTF-8",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      if (pathname === "/api/swagger" || pathname === "/swagger") {
        const baseUrl = `${url.protocol}//${url.host}`;
        const swaggerHtml = createSwaggerUI(baseUrl);
        return new Response(swaggerHtml, {
          headers: {
            "content-type": "text/html; charset=UTF-8",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      if (pathname === "/health") {
        const metrics2 = getMetrics();
        const circuitBreakerStates = {
          geocoding: await geocodingCircuitBreaker.getStateInfo("geocoding:nominatim"),
          r2: await r2CircuitBreaker.getStateInfo("r2:federalridings-2024.geojson")
        };
        return new Response(JSON.stringify({
          status: "healthy",
          timestamp: Date.now(),
          metrics: metrics2,
          circuitBreakers: circuitBreakerStates,
          cacheWarming: getCacheWarmingStatus()
        }), {
          headers: {
            "content-type": "application/json; charset=UTF-8",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      if (pathname === "/metrics") {
        const metrics2 = getMetricsSummary();
        return new Response(JSON.stringify(metrics2), {
          headers: {
            "content-type": "application/json; charset=UTF-8",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      if (pathname.startsWith("/webhooks")) {
        if (!checkBasicAuth(request, env)) {
          return unauthorizedResponse(correlationId);
        }
        if (pathname === "/webhooks" && request.method === "GET") {
          const webhooksMap = await getAllWebhooks(env);
          const webhooks = Array.from(webhooksMap.entries()).map(([id, config]) => ({
            id,
            url: config.url,
            events: config.events,
            active: config.active,
            createdAt: config.createdAt,
            lastDelivery: config.lastDelivery,
            failureCount: config.failureCount
          }));
          return new Response(JSON.stringify({ webhooks }), {
            headers: {
              "content-type": "application/json; charset=UTF-8",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
        if (pathname === "/webhooks/events" && request.method === "GET") {
          const events = await getWebhookEvents(env);
          return new Response(JSON.stringify({ events }), {
            headers: {
              "content-type": "application/json; charset=UTF-8",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
        if (pathname === "/webhooks/deliveries" && request.method === "GET") {
          const deliveries = await getWebhookDeliveries(env);
          return new Response(JSON.stringify({ deliveries }), {
            headers: {
              "content-type": "application/json; charset=UTF-8",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
      }
      if (pathname === "/cache-warming" && request.method === "GET") {
        const status = getCacheWarmingStatus();
        return new Response(JSON.stringify({
          ...status,
          config: {
            enabled: true,
            interval: TIME_CONSTANTS.SIX_HOURS_MS,
            batchSize: 5
          }
        }), {
          headers: {
            "content-type": "application/json; charset=UTF-8",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      if (pathname.startsWith("/api/database")) {
        if (pathname === "/api/database/init" && request.method === "POST") {
          if (!checkBasicAuth(request, env)) {
            return unauthorizedResponse(correlationId);
          }
          try {
            const success = await initializeSpatialDatabase(env);
            return new Response(JSON.stringify({
              success,
              message: success ? "Database initialized successfully" : "Database initialization failed"
            }), {
              headers: {
                "content-type": "application/json; charset=UTF-8",
                "Access-Control-Allow-Origin": "*"
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Database initialization failed",
              500
            );
          }
        }
        if (pathname === "/api/database/sync" && request.method === "POST") {
          if (!checkBasicAuth(request, env)) {
            return unauthorizedResponse(correlationId);
          }
          try {
            const body = await request.json();
            const dataset = body.dataset || "federalridings-2024.geojson";
            const success = await syncGeoJSONToDatabase(env, dataset, loadGeo);
            return new Response(JSON.stringify({
              success,
              message: success ? `Database synced for ${dataset}` : "Database sync failed",
              dataset
            }), {
              headers: {
                "content-type": "application/json; charset=UTF-8",
                "Access-Control-Allow-Origin": "*"
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Database sync failed",
              500
            );
          }
        }
        if (pathname === "/api/database/stats" && request.method === "GET") {
          if (!checkBasicAuth(request, env)) {
            return unauthorizedResponse(correlationId);
          }
          try {
            const dbConfig = getSpatialDbConfig(env);
            return new Response(JSON.stringify({
              enabled: dbConfig.ENABLED,
              features: 0,
              // Would need actual count
              lastSync: null,
              // Would need actual timestamp
              status: dbConfig.ENABLED ? "active" : "disabled"
            }), {
              headers: {
                "content-type": "application/json; charset=UTF-8",
                "Access-Control-Allow-Origin": "*"
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Failed to get database stats",
              500
            );
          }
        }
        if (pathname === "/api/database/query" && request.method === "GET") {
          const lat = parseFloat(url.searchParams.get("lat") || "");
          const lon = parseFloat(url.searchParams.get("lon") || "");
          const dataset = url.searchParams.get("dataset") || "federalridings-2024.geojson";
          if (isNaN(lat) || isNaN(lon)) {
            return badRequest("Invalid lat/lon parameters", 400);
          }
          try {
            const result = await queryRidingFromDatabase(env, dataset, lon, lat);
            return new Response(JSON.stringify(result), {
              headers: {
                "content-type": "application/json; charset=UTF-8",
                "Access-Control-Allow-Origin": "*"
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Database query failed",
              500
            );
          }
        }
        return badRequest("Database endpoint not found", 404);
      }
      if (pathname.startsWith("/api/boundaries")) {
        if (pathname === "/api/boundaries/lookup" && request.method === "GET") {
          const lat = parseFloat(url.searchParams.get("lat") || "");
          const lon = parseFloat(url.searchParams.get("lon") || "");
          const dataset = url.searchParams.get("dataset") || "federalridings-2024.geojson";
          if (isNaN(lat) || isNaN(lon)) {
            return badRequest("Invalid lat/lon parameters", 400);
          }
          try {
            const result = await lookupRiding(env, `/api`, lon, lat);
            return new Response(JSON.stringify(result), {
              headers: {
                "content-type": "application/json; charset=UTF-8",
                "Access-Control-Allow-Origin": "*"
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Boundaries lookup failed",
              500
            );
          }
        }
        if (pathname === "/api/boundaries/all" && request.method === "GET") {
          const dataset = url.searchParams.get("dataset") || "federalridings-2024.geojson";
          const limit = parseInt(url.searchParams.get("limit") || "100");
          const offset = parseInt(url.searchParams.get("offset") || "0");
          try {
            const dbConfig = getSpatialDbConfig(env);
            if (dbConfig.ENABLED && env.RIDING_DB) {
              const result = await getAllFeaturesFromDatabase(env, dataset, limit, offset);
              return new Response(JSON.stringify(result), {
                headers: {
                  "content-type": "application/json; charset=UTF-8",
                  "Access-Control-Allow-Origin": "*"
                }
              });
            } else {
              return badRequest("Spatial database not enabled", 503);
            }
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Failed to get boundaries",
              500
            );
          }
        }
        if (pathname === "/api/boundaries/config" && request.method === "GET") {
          const dbConfig = getSpatialDbConfig(env);
          return new Response(JSON.stringify({
            enabled: dbConfig.ENABLED,
            useRtreeIndex: dbConfig.USE_RTREE_INDEX,
            batchInsertSize: dbConfig.BATCH_INSERT_SIZE,
            datasets: ["federalridings-2024.geojson", "quebecridings-2025.geojson", "ontarioridings-2022.geojson"]
          }), {
            headers: {
              "content-type": "application/json; charset=UTF-8",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
        return badRequest("Boundaries endpoint not found", 404);
      }
      if (pathname === "/api/geocoding/batch/status") {
        if (request.method === "GET") {
          return new Response(JSON.stringify({
            enabled: true,
            maxBatchSize: 10,
            timeout: 3e4,
            retryAttempts: 3,
            fallbackToIndividual: true,
            hasGoogleApiKey: !!env.GOOGLE_MAPS_KEY,
            timestamp: Date.now()
          }), {
            headers: {
              "content-type": "application/json; charset=UTF-8",
              "Access-Control-Allow-Origin": "*"
            }
          });
        } else {
          return badRequest("Method not allowed", 405);
        }
      }
      if (pathname === "/api/cache/warm") {
        if (request.method === "POST") {
          if (!checkBasicAuth(request, env)) {
            return unauthorizedResponse(correlationId);
          }
          try {
            const body = await request.json();
            const locations = body.locations || [];
            for (const location of locations) {
              if (location.lat && location.lon) {
                await loadGeo(env, "federalridings-2024.geojson");
              } else if (location.postal) {
                console.log(`Cache warming for postal code: ${location.postal}`);
              }
            }
            return new Response(JSON.stringify({
              message: "Cache warming initiated",
              locations: locations.length,
              timestamp: Date.now()
            }), {
              headers: {
                "content-type": "application/json; charset=UTF-8",
                "Access-Control-Allow-Origin": "*"
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Cache warming failed",
              500
            );
          }
        } else {
          return badRequest("Method not allowed", 405);
        }
      }
      if (pathname.startsWith("/api/webhooks")) {
        if (pathname === "/api/webhooks" && request.method === "GET") {
          if (!checkBasicAuth(request, env)) {
            return unauthorizedResponse(correlationId);
          }
          const webhooksMap = await getAllWebhooks(env);
          const webhooks = Array.from(webhooksMap.entries()).map(([id, config]) => ({
            id,
            url: config.url,
            events: config.events,
            secret: config.secret ? "***" : void 0,
            createdAt: config.createdAt,
            lastDelivery: config.lastDelivery,
            failureCount: config.failureCount,
            maxFailures: config.maxFailures,
            active: config.active
          }));
          return new Response(JSON.stringify({ webhooks }), {
            headers: {
              "content-type": "application/json; charset=UTF-8",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
        if (pathname === "/api/webhooks" && request.method === "POST") {
          if (!checkBasicAuth(request, env)) {
            return unauthorizedResponse(correlationId);
          }
          try {
            const body = await request.json();
            const webhookId = await createWebhook(env, {
              url: body.url,
              events: body.events,
              secret: body.secret || "",
              active: true
            });
            return new Response(JSON.stringify({
              webhookId,
              message: "Webhook created successfully"
            }), {
              headers: {
                "content-type": "application/json; charset=UTF-8",
                "Access-Control-Allow-Origin": "*"
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Failed to create webhook",
              500
            );
          }
        }
        if (pathname === "/api/webhooks/events" && request.method === "GET") {
          if (!checkBasicAuth(request, env)) {
            return unauthorizedResponse(correlationId);
          }
          const url2 = new URL(request.url);
          const status = url2.searchParams.get("status");
          const webhookId = url2.searchParams.get("webhookId");
          const events = await getWebhookEvents(env, webhookId || void 0);
          const filteredEvents = status ? events.filter((e) => e.status === status) : events;
          return new Response(JSON.stringify({ events: filteredEvents }), {
            headers: {
              "content-type": "application/json; charset=UTF-8",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
        if (pathname === "/api/webhooks/deliveries" && request.method === "GET") {
          if (!checkBasicAuth(request, env)) {
            return unauthorizedResponse(correlationId);
          }
          const url2 = new URL(request.url);
          const webhookId = url2.searchParams.get("webhookId");
          const status = url2.searchParams.get("status");
          const deliveries = await getWebhookDeliveries(env, webhookId || void 0);
          const filteredDeliveries = status ? deliveries.filter((d) => d.status === status) : deliveries;
          return new Response(JSON.stringify({ deliveries: filteredDeliveries }), {
            headers: {
              "content-type": "application/json; charset=UTF-8",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
        return badRequest("Webhook endpoint not found", 404);
      }
      if (pathname.startsWith("/batch")) {
        if (!checkBasicAuth(request, env)) {
          return unauthorizedResponse(correlationId);
        }
        if (pathname === "/batch" && request.method === "POST") {
          try {
            const contentLength = request.headers.get("content-length");
            if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
              return badRequest("Request body too large. Maximum size is 10MB", 413);
            }
            const body = await request.json();
            const requests = body.requests.map((req, index) => ({
              id: req.id || `req_${index}`,
              query: req.query,
              pathname: req.pathname || "/api"
            }));
            const cb = geocodingCircuitBreaker ? { execute: /* @__PURE__ */ __name((k, fn) => geocodingCircuitBreaker.execute(k, fn), "execute") } : void 0;
            const results = await processBatchLookupWithBatchGeocoding(
              env,
              requests,
              geocodeIfNeeded,
              lookupRiding,
              (e, q, req, c) => geocodeBatch(e, q, req, void 0, c ?? cb),
              request,
              cb
            );
            return new Response(JSON.stringify({ results }), {
              headers: {
                "content-type": "application/json; charset=UTF-8",
                "Access-Control-Allow-Origin": "*"
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Batch processing failed",
              500
            );
          }
        }
        if (pathname.startsWith("/batch/") && request.method === "GET") {
          const batchId = pathname.split("/")[2];
          try {
            const status = await getBatchStatus(env, batchId);
            return new Response(JSON.stringify(status), {
              headers: {
                "content-type": "application/json; charset=UTF-8",
                "Access-Control-Allow-Origin": "*"
              }
            });
          } catch (error) {
            return badRequest(
              error instanceof Error ? error.message : "Failed to get batch status",
              500
            );
          }
        }
      }
      if (pathname === "/api/queue/submit") {
        if (request.method !== "POST") {
          return badRequest("Only POST supported for queue submit", 405);
        }
        if (!checkBasicAuth(request, env)) {
          return unauthorizedResponse(correlationId);
        }
        try {
          const contentLength = request.headers.get("content-length");
          if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
            return badRequest("Request body too large. Maximum size is 10MB", 413);
          }
          const body = await request.json();
          if (!body.requests || !Array.isArray(body.requests)) {
            return badRequest("Invalid request body. Expected 'requests' array.", 400);
          }
          const result = await submitBatchToQueue(env, body.requests);
          return new Response(JSON.stringify(result), {
            headers: {
              "content-type": "application/json; charset=UTF-8",
              "Access-Control-Allow-Origin": "*"
            }
          });
        } catch (error) {
          return badRequest(
            error instanceof Error ? error.message : "Failed to submit batch to queue",
            500
          );
        }
      }
      if (pathname === "/api/queue/status") {
        if (request.method !== "GET") {
          return badRequest("Only GET supported for status check", 405);
        }
        if (!checkBasicAuth(request, env)) {
          return unauthorizedResponse(correlationId);
        }
        const batchId = url.searchParams.get("batchId");
        if (!batchId) {
          return badRequest("Missing required parameter: batchId", 400);
        }
        try {
          const result = await getBatchStatus(env, batchId);
          return new Response(JSON.stringify(result), {
            headers: {
              "content-type": "application/json; charset=UTF-8",
              "Access-Control-Allow-Origin": "*"
            }
          });
        } catch (error) {
          return badRequest(
            error instanceof Error ? error.message : "Failed to get batch status",
            500
          );
        }
      }
      if (pathname === "/api/queue/process") {
        if (request.method !== "POST") {
          return badRequest("Only POST supported for queue processing", 405);
        }
        if (!checkBasicAuth(request, env)) {
          return unauthorizedResponse(correlationId);
        }
        try {
          const body = await request.json();
          const result = await processQueueJobs(env, body.maxJobs || 10);
          return new Response(JSON.stringify(result), {
            headers: {
              "content-type": "application/json; charset=UTF-8",
              "Access-Control-Allow-Origin": "*"
            }
          });
        } catch (error) {
          return badRequest(
            error instanceof Error ? error.message : "Failed to process queue jobs",
            500
          );
        }
      }
      if (pathname === "/api/queue/stats") {
        if (request.method !== "GET") {
          return badRequest("Only GET supported for queue stats", 405);
        }
        if (!checkBasicAuth(request, env)) {
          return unauthorizedResponse(correlationId);
        }
        try {
          if (!env.QUEUE_MANAGER) {
            return badRequest("Queue manager not configured", 503);
          }
          const queueManagerId = env.QUEUE_MANAGER.idFromName("main-queue");
          const queueManager = env.QUEUE_MANAGER.get(queueManagerId);
          const response = await queueManager.fetch(new Request("https://queue.local/queue/stats"));
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to get queue stats");
          }
          const stats = await response.json();
          return new Response(JSON.stringify(stats), {
            headers: {
              "content-type": "application/json; charset=UTF-8",
              "Access-Control-Allow-Origin": "*"
            }
          });
        } catch (error) {
          return badRequest(
            error instanceof Error ? error.message : "Failed to get queue stats",
            500
          );
        }
      }
      if (pathname === "/queue/process" && request.method === "POST") {
        if (!checkBasicAuth(request, env)) {
          return unauthorizedResponse(correlationId);
        }
        try {
          const body = await request.json();
          const result = await processQueueJobs(env, body.maxJobs || 10);
          return new Response(JSON.stringify(result), {
            headers: {
              "content-type": "application/json; charset=UTF-8",
              "Access-Control-Allow-Origin": "*"
            }
          });
        } catch (error) {
          return badRequest(
            error instanceof Error ? error.message : "Queue processing failed",
            500
          );
        }
      }
      if (pathname.startsWith("/api")) {
        const clientId = getClientId(request);
        if (!checkRateLimit(env, clientId)) {
          return rateLimitExceededResponse(correlationId);
        }
        if (!checkBasicAuth(request, env)) {
          return unauthorizedResponse(correlationId);
        }
        try {
          const { query, validation } = parseQuery(request);
          if (!validation.valid) {
            return badRequest(validation.error || "Invalid query parameters", 400, "INVALID_QUERY", correlationId);
          }
          const sanitizedQuery = validation.sanitized;
          incrementMetric("lookupRequests");
          const cacheKey = generateLookupCacheKey(sanitizedQuery, pathname);
          const cachedResult = await getCachedLookupResult(env, cacheKey);
          if (cachedResult) {
            incrementMetric("lookupCacheHits");
            recordTiming("totalLookupTime", Date.now() - startTime);
            const origin2 = request.headers.get("Origin");
            const point = cachedResult.point || (sanitizedQuery.lat !== void 0 && sanitizedQuery.lon !== void 0 ? { lon: sanitizedQuery.lon, lat: sanitizedQuery.lat } : void 0);
            return new Response(JSON.stringify({
              query: sanitizedQuery,
              point,
              properties: cachedResult.properties,
              riding: cachedResult.riding,
              ...cachedResult.normalizedAddress && { normalizedAddress: cachedResult.normalizedAddress },
              correlationId
            }), {
              headers: {
                "content-type": "application/json; charset=UTF-8",
                "X-Cache-Status": "HIT",
                ...getCorsHeaders(origin2)
              }
            });
          }
          incrementMetric("lookupCacheMisses");
          const timeoutConfig = getTimeoutConfig(env);
          const cb = geocodingCircuitBreaker ? { execute: /* @__PURE__ */ __name((k, fn) => geocodingCircuitBreaker.execute(k, fn), "execute") } : void 0;
          const geocodeResult = await withTimeout2(
            geocodeIfNeeded(env, sanitizedQuery, request, void 0, cb),
            timeoutConfig.geocoding,
            "Geocoding"
          );
          const { lon, lat } = geocodeResult;
          let normalizedAddress = geocodeResult.normalizedAddress;
          if (!normalizedAddress && (request?.headers.get("X-Google-API-Key") || env.GOOGLE_MAPS_KEY)) {
            normalizedAddress = await normalizeAddressWithGoogle(env, geocodeResult.lat, geocodeResult.lon, request, cb) ?? void 0;
          }
          const result = await withTimeout2(
            lookupRiding(env, pathname, lon, lat),
            timeoutConfig.lookup,
            "Riding lookup"
          );
          const { r2Key } = pickDataset(pathname);
          const dataset = r2Key.replace(".geojson", "");
          const lookupResult = {
            properties: result.properties,
            riding: result.riding,
            ...normalizedAddress && { normalizedAddress }
          };
          await setCachedLookupResult(env, cacheKey, lookupResult, dataset, { lon, lat });
          recordTiming("totalLookupTime", Date.now() - startTime);
          const origin = request.headers.get("Origin");
          return new Response(JSON.stringify({
            query: sanitizedQuery,
            point: { lon, lat },
            ...result,
            ...normalizedAddress && { normalizedAddress },
            correlationId
          }), {
            headers: {
              "content-type": "application/json; charset=UTF-8",
              "X-Cache-Status": "MISS",
              ...getCorsHeaders(origin)
            }
          });
        } catch (error) {
          incrementMetric("errorCount");
          console.error(`[${correlationId}] Lookup error:`, error);
          return badRequest(
            error instanceof Error ? error.message : "Lookup failed",
            500,
            "LOOKUP_ERROR",
            correlationId
          );
        }
      }
      return badRequest("Not found", 404, "NOT_FOUND", correlationId);
    } catch (err) {
      incrementMetric("errorCount");
      recordTiming("totalLookupTime", Date.now() - startTime);
      console.error(`[${correlationId}] Unexpected error:`, err);
      return badRequest(err instanceof Error ? err.message : "Unexpected error", 400, "UNEXPECTED_ERROR", correlationId);
    }
  },
  async scheduled(event, env, ctx) {
    if (!geocodingCircuitBreaker || !r2CircuitBreaker) {
      initializeCircuitBreakers(env);
    }
    await handleScheduled(event, env, ctx);
  }
};
export {
  CircuitBreakerDO,
  QueueManager as QueueManagerDO,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
