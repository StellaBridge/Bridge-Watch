import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "../Input";

const meta: Meta<typeof Input> = {
    title: "Form/Input",
    component: Input,
    tags: ["autodocs"],
    argTypes: {
        type: {
            control: "select",
            options: ["text", "number", "email", "password", "tel", "url", "search"],
        },
    },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
    args: {
        id: "input-default",
        name: "email",
        label: "Email Address",
        placeholder: "Enter your email",
    },
};

export const WithError: Story = {
    args: {
        id: "input-error",
        name: "email",
        label: "Email Address",
        value: "invalid-email",
        error: "Please enter a valid email address.",
    },
};

export const WithHelpText: Story = {
    args: {
        id: "input-help",
        name: "password",
        label: "Password",
        type: "password",
        helperText: "Must be at least 8 characters long.",
    },
};

export const Required: Story = {
    args: {
        id: "input-required",
        name: "username",
        label: "Username",
        required: true,
    },
};

export const Disabled: Story = {
    args: {
        id: "input-disabled",
        name: "id",
        label: "Account ID",
        value: "BW-12345",
        disabled: true,
    },
};

export const Loading: Story = {
    args: {
        id: "input-loading",
        name: "search",
        label: "Search assets",
        loading: true,
    },
};
