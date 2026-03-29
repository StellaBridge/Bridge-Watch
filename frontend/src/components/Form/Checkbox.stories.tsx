import type { Meta, StoryObj } from "@storybook/react";
import { Checkbox } from "../Checkbox";

const meta: Meta<typeof Checkbox> = {
    title: "Form/Checkbox",
    component: Checkbox,
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Unchecked: Story = {
    args: {
        id: "checkbox-unchecked",
        name: "terms",
        label: "I accept the terms and conditions",
    },
};

export const Checked: Story = {
    args: {
        id: "checkbox-checked",
        name: "terms",
        label: "I accept the terms and conditions",
        checked: true,
    },
};

export const WithError: Story = {
    args: {
        id: "checkbox-error",
        name: "terms",
        label: "I accept the terms and conditions",
        error: "You must accept the terms to proceed.",
        required: true,
    },
};

export const Disabled: Story = {
    args: {
        id: "checkbox-disabled",
        name: "terms",
        label: "I accept the terms and conditions",
        disabled: true,
    },
};
