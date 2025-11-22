
import React, { useState, useEffect, ChangeEvent } from 'react';

interface MoneyInputProps {
    value: number;
    onChange: (val: number) => void;
    className?: string;
    placeholder?: string;
    autoFocus?: boolean;
}

export const MoneyInput: React.FC<MoneyInputProps> = ({
    value,
    onChange,
    className,
    placeholder,
    autoFocus
}) => {
    const [displayValue, setDisplayValue] = useState('');

    // Format helper: 1000 -> "1.000"
    const formatNumber = (num: number) => {
        return new Intl.NumberFormat('vi-VN').format(num);
    };

    // Sync with external value (e.g. reset form, or initial load)
    useEffect(() => {
        // If the external value matches what we have in our state (parsed), don't update
        // This prevents cursor jumping issues in some cases, though simple string replace is usually safe for end-typing
        const currentRaw = parseInt(displayValue.replace(/\./g, '') || '0', 10);

        if (value !== currentRaw) {
            if (value === 0) {
                // Decide if we show '0' or empty. Empty is often cleaner for placeholders.
                setDisplayValue('');
            } else {
                setDisplayValue(formatNumber(value));
            }
        }
    }, [value]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const input = e.target.value;

        // 1. Keep only digits
        const rawString = input.replace(/[^0-9]/g, '');

        // 2. Handle empty
        if (!rawString) {
            setDisplayValue('');
            onChange(0);
            return;
        }

        // 3. Parse to integer
        const rawNumber = parseInt(rawString, 10);

        // 4. Update parent with number
        onChange(rawNumber);

        // 5. Update local display with formatting
        setDisplayValue(formatNumber(rawNumber));
    };

    return (
        <input
            type="text"
            inputMode="numeric"
            value={displayValue}
            onChange={handleChange}
            className={className}
            placeholder={placeholder}
            autoFocus={autoFocus}
        />
    );
};
