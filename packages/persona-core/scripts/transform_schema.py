#!/usr/bin/env python3
"""Transform persona_pack.schema.json from snake_case to camelCase."""

import json
import re
from pathlib import Path


def to_camel_case(snake_str: str) -> str:
    """Convert snake_case string to camelCase."""
    components = snake_str.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


def transform_keys(obj):
    """Recursively transform all keys in a JSON object from snake_case to camelCase."""
    if isinstance(obj, dict):
        new_obj = {}
        for key, value in obj.items():
            # Don't transform JSON Schema keywords that start with $
            if key.startswith("$"):
                new_key = key
            # Don't transform standard JSON Schema keywords
            elif key in (
                "type",
                "required",
                "properties",
                "items",
                "additionalProperties",
                "description",
                "format",
                "minItems",
                "maxItems",
                "default",
                "enum",
                "title",
                "definitions",
                "allOf",
                "anyOf",
                "oneOf",
                "not",
                "if",
                "then",
                "else",
                "const",
                "pattern",
                "minimum",
                "maximum",
                "exclusiveMinimum",
                "exclusiveMaximum",
                "multipleOf",
                "minLength",
                "maxLength",
                "minProperties",
                "maxProperties",
                "uniqueItems",
                "contains",
                "propertyNames",
                "patternProperties",
                "dependencies",
                "examples",
            ):
                new_key = key
            else:
                new_key = to_camel_case(key)

            # Transform the value recursively
            new_obj[new_key] = transform_keys(value)

        # Special handling for "required" array - transform the field names in it
        if "required" in new_obj and isinstance(new_obj["required"], list):
            new_obj["required"] = [to_camel_case(field) for field in new_obj["required"]]

        return new_obj
    elif isinstance(obj, list):
        return [transform_keys(item) for item in obj]
    else:
        return obj


def main():
    scripts_dir = Path(__file__).parent
    package_dir = scripts_dir.parent
    schemas_dir = package_dir / "schemas"
    generated_dir = package_dir / "python" / "generated"

    input_path = schemas_dir / "persona_pack.schema.json"
    output_path = generated_dir / "persona_pack.camelcase.schema.json"

    print(f"Reading: {input_path}")
    with open(input_path) as f:
        schema = json.load(f)

    transformed = transform_keys(schema)

    print(f"Writing: {output_path}")
    generated_dir.mkdir(exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(transformed, f, indent=2)

    print("Done! Schema transformed to camelCase.")


if __name__ == "__main__":
    main()
