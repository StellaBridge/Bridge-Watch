import type { Meta, StoryObj } from "@storybook/react";
import { RadioGroup } from "../RadioGroup";

const meta: Meta<typeof RadioGroup> = {
    title: "Form/RadioGroup",
    component: RadioGroup,
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof RadioGroup>;

const options = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "annually", label: "Annually", disabled: true },
];

export const Vertical: Story = {
    args: {
        id: "rg-vertical",
        name: "frequency",
        label: "Update Frequency",
        options,
        value: "weekly",
    },
};

export const Horizontal: Story = {
    args: {
        id: "rg-horizontal",
        name: "frequency",
        label: "Update Frequency",
        options,
        direction: "horizontal",
        value: "daily",
    },
};

export const WithError: Story = {
    args: {
        id: "rg-error",
        name: "frequency",
        label: "Update Frequency",
        options,
        error: "Please select a frequency.",
    },
};
