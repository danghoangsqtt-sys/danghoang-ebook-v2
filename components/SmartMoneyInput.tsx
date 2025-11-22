
import React, { useState, useEffect } from 'react';

interface SmartMoneyInputProps {
    value: number;
    onChange: (val: number) => void;
    className?: string;
    placeholder?: string;
    autoFocus?: boolean;
}

export const SmartMoneyInput: React.FC<SmartMoneyInputProps> = ({ value, onChange, className, placeholder, autoFocus }) => {
    const [displayValue, setDisplayValue] = useState('');
    const [isCalculated, setIsCalculated] = useState(false);

    // Format number to Vietnamese currency style (dots for thousands)
    const formatNumber = (num: number) => {
        if (isNaN(num) || num === 0) return '';
        return new Intl.NumberFormat('vi-VN').format(num);
    };

    useEffect(() => {
        // Sync display value when prop updates, unless we are typing (handled by local state, but here we assume prop update wins on blur/external change)
        if (value !== undefined && value !== 0) {
            setDisplayValue(formatNumber(value));
        } else if (value === 0) {
            // Only reset if user cleared it or explicit 0
            // Don't force overwrite if user is typing '0'
        }
    }, [value]);

    const evaluateExpression = (input: string) => {
        if (!input) return null;

        // 1. Handle shorthand (k, m)
        // Regex to find numbers followed by k or m
        let processed = input.toLowerCase();

        // Replace '1.5k' -> '(1.5*1000)'
        processed = processed.replace(/([0-9.,]+)k/g, '($1*1000)');
        processed = processed.replace(/([0-9.,]+)m/g, '($1*1000000)');

        // 2. Clean up for JS Evaluation
        // In VN format: "." is thousand separator, "," is decimal separator
        // JS format: No thousand separator, "." is decimal separator

        // Remove dots (thousands)
        processed = processed.replace(/\./g, '');
        // Replace comma with dot (decimal)
        processed = processed.replace(/,/g, '.');

        // 3. Safety check: allow only numbers, operators, parenthesis
        if (!/^[0-9+\-*/().\s]+$/.test(processed)) {
            // If it's just a number, return parsed
            const num = parseFloat(processed);
            return isNaN(num) ? null : num;
        }

        try {
            // Safe eval using Function constructor with strict input check above
            // eslint-disable-next-line no-new-func
            const result = new Function('return ' + processed)();
            return typeof result === 'number' && !isNaN(result) && isFinite(result) ? result : null;
        } catch (e) {
            return null;
        }
    };

    const handleCalculate = () => {
        if (!displayValue) {
            onChange(0);
            return;
        }

        // Check if calculation happened (contains operators or shorthand)
        const needsCalc = /[+\-*/km]/.test(displayValue.toLowerCase());

        const result = evaluateExpression(displayValue);

        if (result !== null) {
            onChange(result);
            setDisplayValue(formatNumber(result));
            if (needsCalc) {
                setIsCalculated(true);
                setTimeout(() => setIsCalculated(false), 2000);
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleCalculate();
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDisplayValue(e.target.value);
    };

    return (
        <div className="relative">
            <input
                type="text"
                value={displayValue}
                onChange={handleChange}
                onBlur={handleCalculate}
                onKeyDown={handleKeyDown}
                className={className}
                placeholder={placeholder}
                autoFocus={autoFocus}
            />
            {isCalculated && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold animate-bounce shadow-sm border border-green-200">
                    ✓ Đã tính
                </div>
            )}
        </div>
    );
};
