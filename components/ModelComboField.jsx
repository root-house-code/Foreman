import ComboInput from "./ComboInput.jsx";

// A free-text combobox with autocomplete suggestions (manufacturers, models,
// item types, locations, …). Extracted from inventory-page.jsx so the Notebook
// article editor can reuse the same control. Behaviour is unchanged.
export default function ModelComboField({ value = "", models = [], fieldStyle, onChange }) {
  return (
    <ComboInput
      value={value}
      onChange={onChange}
      options={models}
      placeholder="—"
      style={fieldStyle}
    />
  );
}
