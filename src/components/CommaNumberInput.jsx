import React from 'react';
import NumberInput from './NumberInput';

// A dollar field that shows thousands separators ("245,000") while it is not
// being edited and plain digits while it is. All parsing and validation is
// NumberInput's (one set of rules for every number in the Plan form); this
// wrapper only turns on the commas, defaults the range to 0 or more, and
// keeps its callers' value-style onChange(number) signature. It never passes
// '' up: a cleared field settles to 0 on blur.
const CommaNumberInput = ({ id, value, onChange, disabled, className = 'form-input', style, placeholder, min = 0, max, message, ...rest }) => (
  <NumberInput
    id={id}
    value={value}
    min={min}
    max={max}
    commas
    kind="number"
    message={message}
    className={className}
    style={style}
    placeholder={placeholder}
    disabled={disabled}
    onChange={(e) => onChange(Number(e.target.value))}
    {...rest}
  />
);

export default CommaNumberInput;
