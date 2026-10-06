"""Pure per-role options, also used by the shell-only eval CLI."""
import math

REASONING_EFFORTS = {'none', 'minimal', 'low', 'medium', 'high', 'xhigh'}


def optional_temperature(value):
    if value is None or isinstance(value, str) and not value.strip():
        return None
    number = float(value)
    if not math.isfinite(number) or not 0 <= number <= 2:
        raise ValueError('Temperature must be finite and between 0 and 2')
    return number


def optional_reasoning(value):
    if value is None or isinstance(value, str) and not value.strip():
        return None
    if value not in REASONING_EFFORTS:
        raise ValueError('Unsupported reasoning effort')
    return value


def model_options(temperature=None, reasoning_effort=None):
    options = {}
    temperature = optional_temperature(temperature)
    effort = optional_reasoning(reasoning_effort)
    if temperature is not None:
        options['temperature'] = temperature
    if effort is not None:
        options['model_kwargs'] = {'reasoning_effort': effort}
    return options
