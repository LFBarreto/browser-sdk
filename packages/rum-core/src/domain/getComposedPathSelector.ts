
import { safeTruncate, ONE_KIBI_BYTE, matchList } from '@datadog/browser-core';
import type { MatchOption } from '@datadog/browser-core';
import { STABLE_ATTRIBUTES, isGeneratedValue, getIDSelector, getTagNameSelector } from './getSelectorFromElement'



const FILTERED_TAGNAMES = ['HTML', 'BODY'];

/**
 * arbitrary value, we want to truncate the selector if it exceeds the limit
 */
const CHARACTER_LIMIT = 2 * ONE_KIBI_BYTE; 

/**
 * Safe attributes that can be collected without PII concerns.
 * These are commonly used for testing, accessibility, and UI identification.
 */
export const SAFE_ATTRIBUTES = STABLE_ATTRIBUTES.concat([
  // Additional safe attributes
  'role', // Accessibility role (button, navigation, etc.)
  'type', // Input type (submit, button, text, etc.)
  'name', // Form element names (typically non-PII)
  'disabled', // Element state
  'readonly', // Element state
  'checked', // Checkbox/radio state
  'selected', // Option state
  'aria-expanded', // Accessibility state
  'aria-selected', // Accessibility state
  'aria-pressed', // Accessibility state
  'aria-checked', // Accessibility state
  'aria-disabled', // Accessibility state
  'aria-hidden', // Accessibility state
  'aria-haspopup', // Accessibility state
  'aria-controls', // Accessibility relationship
  'aria-describedby', // Accessibility relationship
  'aria-labelledby', // Accessibility relationship
  'tabindex', // Focus management
  'contenteditable', // Editable state
  'draggable', // Drag state
  'target', // Link target (_blank, _self, etc.)
  'rel', // Link relationship
  'download', // Download attribute
  'method', // Form method
  'action', // Form action (path only, no query params with PII)
  'enctype', // Form encoding type
  'autocomplete', // Form autocomplete hint
  'inputmode', // Input mode hint
  'enterkeyhint', // Enter key hint
]);

/**
 * Extracts a selector string from a MouseEvent composedPath.
 *
 * This function:
 * 1. Filters out non-Element items (Document, Window, ShadowRoot)
 * 2. Extracts a selector string from each element
 * 3. Truncates the selector string if it exceeds the character limit
 * 4. Returns the selector string
 *
 * @param composedPath - The composedPath from a MouseEvent
 * @returns A selector string
 */
export function getComposedPathSelector(composedPath: EventTarget[], actionNameAttribute: string | undefined, attributesAllowList: MatchOption[]): string {
  // Filter to only include Element nodes
  const elements = composedPath.filter((el) => el instanceof Element && !FILTERED_TAGNAMES.includes(el.tagName)) as Element[]

  if (elements.length === 0) {
    return '';
  }

  const allowedAttributes = [actionNameAttribute ? [actionNameAttribute] : [], SAFE_ATTRIBUTES, attributesAllowList].flat()

  let result: string = '';

  for (let i = 0; i < elements.length; i++) {
    const selectorString = getSelectorStringFromElement(elements[i], allowedAttributes);
    const tmpResult = result + selectorString;
    if (tmpResult.length >= CHARACTER_LIMIT) {
      result = safeTruncate(tmpResult, CHARACTER_LIMIT - 3, '...');
      break;
    }
    result = tmpResult;
  }

  return result;
}

/**
 * Extracts a selector string from an element.
 */
function getSelectorStringFromElement(element: Element, allowedAttributes: MatchOption[]): string {
  let selector = getTagNameSelector(element)
  const id = getIDSelector(element)
  const classes = getElementClassList(element)
  const attributes = extractSafeAttributes(element, allowedAttributes)
  const { nthChild, nthOfType } = computePositionData(element)

  if (id) {
    selector += id
  }
  Object.entries(attributes).forEach(([key, value]) => {
    selector += `[${CSS.escape(key)}="${CSS.escape(value)}"]`
  })
  classes.forEach((c) => {
    selector += `.${CSS.escape(c)}`
  })
  if (nthChild) {
    selector += `:nth-child(${nthChild})`
  }
  if (nthOfType) {
    selector += `:nth-of-type(${nthOfType})`
  }

  return `${selector};`;
}

function getElementClassList(element: Element): string[] {
  return Array.from(element.classList).filter((c) => c.trim() !== '' && !isGeneratedValue(c))
}

/**
 * Computes the nthChild and nthOfType positions for an element.
 *
 * - nthChild: 1-based position among all siblings. Only set if element has siblings.
 * - nthOfType: 1-based position among siblings of the same tag type. Only set if not unique of type.
 */
function computePositionData(element: Element): { nthChild?: number; nthOfType?: number } {
  const parent = element.parentElement
  if (!parent) {
    return {}
  }

  const siblings = Array.from(parent.children)
  const totalSiblings = siblings.length

  // If element is the only child, no position data needed
  if (totalSiblings <= 1) {
    return {}
  }

  // Calculate nthChild (1-based index among all siblings)
  let nthChild: number | undefined;
  let nthOfType: number | undefined;
  const sameTypeSiblings = siblings.filter((sibling) => sibling.tagName === element.tagName)
  for (let i = 0, j = 0; i < siblings.length; i++) {
    const currentSibling = siblings[i]
    if(currentSibling.tagName === element.tagName) {
      j++
    }
    if (currentSibling === element) {
      nthChild = i + 1 // 1-based
      if(sameTypeSiblings.length > 1 && j > 0) {
        nthOfType = j // 1-based
      }
      break
    }
  }

  return { nthChild, nthOfType }
}

/**
 * Extracts only the safe (allowlisted) attributes from an element.
 */
function extractSafeAttributes(element: Element, allowedAttributes: MatchOption[]): Record<string, string> {
  const result: Record<string, string> = {}

  if (!element.hasAttributes()) {
    return result
  }

  const attributes = Array.from(element.attributes)
  for (const attr of attributes) {
    if(matchList(allowedAttributes, attr.name)) {
      result[attr.name] = attr.value;
    }
  }

  return result
}