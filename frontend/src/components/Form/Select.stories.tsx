import type { Meta, StoryObj } from "@storybook/react";
import { Select } from "../Select";

const meta: Meta<typeof Select> = {
    title: "Form/Select",
    component: Select,
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Select>;

const options = [
    { value: "usdc", label: "USDC" },
    { value: "xlm", label: "Stellar XLM" },
    { value: "eurc", label: "EURC" },
    { value: "eth", label: "Ethereum", disabled: true },
];

export const Default: Story = {
    args: {
        id: "select-default",
        name: "asset",
        label: "Select Asset",
        options,
        placeholder: "Choose an asset...",
    },
};

export const WithError: Story = {
    args: {
        id: "select-error",
        name: "asset",
        label: "Select Asset",
        options,
        error: "Asset selection is required.",
    },
};

export const Loading: Story = {
    args: {
        id: "select-loading",
        name: "asset",
        label: "Select Asset",
        options,
        loading: true,
    },
};

export const Disabled: Story = {
    args: {
        id: "select-disabled",
        name: "asset",
        label: "Select Asset",
        options,
        disabled: true,
    },
};
