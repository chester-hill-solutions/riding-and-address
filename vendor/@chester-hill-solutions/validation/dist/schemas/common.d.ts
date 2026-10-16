/**
 * Common validation schemas used across the application.
 * Includes built-in normalization and consistent error messages.
 */
import { z } from "zod";
/**
 * Email validation with automatic normalization.
 * Validates format and converts to lowercase.
 */
export declare const EmailSchema: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
/**
 * Password validation with configurable minimum length.
 * Default minimum is 8 characters.
 */
export declare const PasswordSchema: z.ZodString;
/**
 * Password validation for bootstrap/admin setup (12 character minimum).
 */
export declare const BootstrapPasswordSchema: z.ZodString;
/**
 * Phone number validation with normalization.
 * Accepts various formats and normalizes them.
 */
export declare const PhoneSchema: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>>;
/**
 * Canadian postal code validation with normalization.
 * Expects format: A1A 1A1 or A1A1A1 (case-insensitive, space optional after 3rd character)
 */
export declare const CanadianPostalCodeSchema: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
/**
 * Name validation with normalization.
 * Handles first names, last names, etc.
 */
export declare const NameSchema: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
/**
 * Street address validation with normalization.
 */
export declare const StreetAddressSchema: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
/**
 * Province/territory validation with normalization.
 */
export declare const ProvinceSchema: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
/**
 * Birth year validation.
 * Accepts reasonable birth years (1900 to current year).
 */
export declare const BirthYearSchema: z.ZodCoercedNumber<unknown>;
/**
 * Birth month validation (1-12).
 */
export declare const BirthMonthSchema: z.ZodCoercedNumber<unknown>;
/**
 * Birth day validation (1-31).
 * Note: Full date validation should be done at the form level.
 */
export declare const BirthDaySchema: z.ZodCoercedNumber<unknown>;
/**
 * Role validation using existing RoleType enum.
 */
export declare const RoleSchema: z.ZodString;
/**
 * Boolean validation for form checkboxes.
 * Converts checkbox "on" values to boolean.
 */
export declare const CheckboxBooleanSchema: z.ZodPipe<z.ZodLiteral<"on">, z.ZodTransform<boolean, "on">>;
/**
 * Optional boolean for form checkboxes.
 */
export declare const OptionalCheckboxBooleanSchema: z.ZodOptional<z.ZodUnion<[z.ZodUnion<[z.ZodPipe<z.ZodLiteral<"on">, z.ZodTransform<boolean, "on">>, z.ZodPipe<z.ZodLiteral<"off">, z.ZodTransform<boolean, "off">>]>, z.ZodPipe<z.ZodString, z.ZodTransform<boolean, string>>]>>;
/**
 * ID validation for database entities.
 * Accepts positive integers.
 */
export declare const IdSchema: z.ZodNumber;
/**
 * Optional ID validation.
 */
export declare const OptionalIdSchema: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
