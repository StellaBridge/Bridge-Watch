import type { Meta, StoryObj } from "@storybook/react";
import { FormLabel } from "../FormLabel";
import { FormError } from "../FormError";
import { FormHelpText } from "../FormHelpText";

const labelMeta: Meta<typeof FormLabel> = {
    title: "Form/Primitives/FormLabel",
    component: FormLabel,
};

export default labelMeta;

export const LabelDefault: StoryObj<typeof FormLabel> = {
    render: () => <FormLabel htmlFor="id">Field Label</FormLabel>,
};

export const LabelRequired: StoryObj<typeof FormLabel> = {
    render: () => (
        <FormLabel htmlFor="id" required>
            Required Field
        </FormLabel>
    ),
};

export const ErrorDefault: StoryObj<typeof FormError> = {
    render: () => <FormError id="error-id">This is an error message.</FormError>,
};

export const HelpTextDefault: StoryObj<typeof FormHelpText> = {
    render: () => (
        <FormHelpText id="help-id">This is some helpful information.</FormHelpText>
    ),
};
