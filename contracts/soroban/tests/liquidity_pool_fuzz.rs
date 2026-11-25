#![cfg(test)]

use bridge_watch_contracts::liquidity_pool::{
    calculate_swap_amount_out, div_u256_by_u128, k_invariant_holds, mul_u128, SwapError,
};

/// Deterministic pseudo-random number generator (PCG/LCG) for reproducible fuzz testing.
struct FuzzRng {
    state: u64,
    inc: u64,
}

impl FuzzRng {
    fn new(seed: u64) -> Self {
        let mut rng = Self {
            state: seed,
            inc: (seed << 1) | 1,
        };
        rng.next_u64();
        rng
    }

    fn next_u64(&mut self) -> u64 {
        let oldstate = self.state;
        self.state = oldstate
            .wrapping_mul(6364136223846793005)
            .wrapping_add(self.inc);
        let xorshifted = (((oldstate >> 18) ^ oldstate) >> 27) as u32;
        let rot = (oldstate >> 59) as u32;
        let v = (xorshifted >> rot) | (xorshifted << ((!rot).wrapping_add(1) & 31));
        ((v as u64) << 32) | (xorshifted as u64)
    }

    fn next_u128(&mut self) -> u128 {
        let hi = self.next_u64() as u128;
        let lo = self.next_u64() as u128;
        (hi << 64) | lo
    }

    fn gen_range_u128(&mut self, min: u128, max: u128) -> u128 {
        assert!(min <= max);
        if min == max {
            return min;
        }
        let span = max - min;
        min + (self.next_u128() % span)
    }

    fn gen_fee_bps(&mut self) -> u32 {
        (self.next_u64() % 10_001) as u32
    }
}

#[test]
fn test_constant_product_invariant_arbitrary_amounts() {
    let mut rng = FuzzRng::new(0x1337_BEEF_CAFE_0001);

    // Run 2,500 random property fuzz cycles
    for _ in 0..2500 {
        let r_in = rng.gen_range_u128(1, 10_000_000_000_000_000_000);
        let r_out = rng.gen_range_u128(1, 10_000_000_000_000_000_000);
        let amount_in = rng.gen_range_u128(1, 1_000_000_000_000_000_000);
        let fee_bps = rng.gen_fee_bps();

        match calculate_swap_amount_out(r_in, r_out, amount_in, fee_bps) {
            Ok(amount_out) => {
                assert!(
                    amount_out < r_out,
                    "Amount out must never completely drain reserve"
                );
                let r_in_after = r_in.checked_add(amount_in).expect("reserve_in overflow");
                let r_out_after = r_out - amount_out;

                assert!(
                    k_invariant_holds(r_in, r_out, r_in_after, r_out_after),
                    "Invariant violated: k_after must be >= k_before"
                );
            }
            Err(e) => {
                assert!(
                    matches!(e, SwapError::InsufficientLiquidity | SwapError::Overflow),
                    "Unexpected error: {:?}",
                    e
                );
            }
        }
    }
}

#[test]
fn test_extreme_swap_ratios() {
    let one_wei = 1u128;
    let tokens_1e18 = 1_000_000_000_000_000_000u128; // 10^18
    let tokens_1e24 = 1_000_000_000_000_000_000_000_000u128; // 10^24
    let tokens_1e30 = 1_000_000_000_000_000_000_000_000_000_000u128; // 10^30

    let fee_bps = 30u32; // 0.3% standard DEX fee

    // Case 1: 1 wei swap into 10^18 reserve
    let out1 = calculate_swap_amount_out(tokens_1e18, tokens_1e18, one_wei, fee_bps).unwrap();
    assert!(out1 <= one_wei);
    assert!(k_invariant_holds(
        tokens_1e18,
        tokens_1e18,
        tokens_1e18 + one_wei,
        tokens_1e18 - out1
    ));

    // Case 2: Extreme asymmetric reserves (1 wei vs 10^18 tokens)
    let out2 = calculate_swap_amount_out(one_wei, tokens_1e18, one_wei, fee_bps).unwrap();
    assert!(out2 < tokens_1e18);
    assert!(k_invariant_holds(
        one_wei,
        tokens_1e18,
        one_wei + one_wei,
        tokens_1e18 - out2
    ));

    // Case 3: 10^18 tokens swap into 1 wei reserve
    let out3 = calculate_swap_amount_out(tokens_1e18, one_wei, tokens_1e18, fee_bps);
    // Either outputs 0 or fails if amount_out == 1 (draining 100% of reserve)
    if let Ok(amount_out) = out3 {
        assert!(amount_out < one_wei);
        assert!(k_invariant_holds(
            tokens_1e18,
            one_wei,
            tokens_1e18 + tokens_1e18,
            one_wei - amount_out
        ));
    } else {
        assert!(matches!(out3, Err(SwapError::InsufficientLiquidity)));
    }

    // Case 4: Deep liquidity 10^30 reserves with 10^24 swap
    let out4 = calculate_swap_amount_out(tokens_1e30, tokens_1e30, tokens_1e24, fee_bps).unwrap();
    assert!(out4 > 0 && out4 < tokens_1e30);
    assert!(k_invariant_holds(
        tokens_1e30,
        tokens_1e30,
        tokens_1e30 + tokens_1e24,
        tokens_1e30 - out4
    ));
}

#[test]
fn test_fee_deduction_never_results_in_balance_decrease() {
    let mut rng = FuzzRng::new(0xFEED_FACE_CAFE_BEEF);

    for _ in 0..1000 {
        let r_in = rng.gen_range_u128(1_000_000, 10_000_000_000_000);
        let r_out = rng.gen_range_u128(1_000_000, 10_000_000_000_000);
        let amount_in = rng.gen_range_u128(100, 1_000_000_000);

        let out_no_fee = calculate_swap_amount_out(r_in, r_out, amount_in, 0).unwrap();
        let out_with_fee = calculate_swap_amount_out(r_in, r_out, amount_in, 30).unwrap();
        let out_high_fee = calculate_swap_amount_out(r_in, r_out, amount_in, 500).unwrap();

        // Higher fees strictly reduce or equal the amount paid out to the swapper
        assert!(
            out_with_fee <= out_no_fee,
            "Fee deduction gave higher amount out"
        );
        assert!(
            out_high_fee <= out_with_fee,
            "Higher fee gave higher amount out"
        );

        // Reserve in always increases by exactly amount_in
        let r_in_after = r_in + amount_in;
        assert!(r_in_after > r_in);

        // Reserve out after swap with fee retains MORE or EQUAL balance than with no fee
        let r_out_after_fee = r_out - out_with_fee;
        let r_out_after_no_fee = r_out - out_no_fee;
        assert!(
            r_out_after_fee >= r_out_after_no_fee,
            "Pool balance retained decreased with fee"
        );

        // Both preserve k invariant
        assert!(k_invariant_holds(r_in, r_out, r_in_after, r_out_after_fee));
        assert!(k_invariant_holds(
            r_in,
            r_out,
            r_in_after,
            r_out_after_no_fee
        ));
    }
}

#[test]
fn test_no_arithmetic_panics_under_arbitrary_u128_inputs() {
    let mut rng = FuzzRng::new(0xDEAD_C0DE_8BAD_F00D);

    // Boundary cases
    let boundary_values = [
        0u128,
        1u128,
        2u128,
        10u128,
        1000u128,
        1_000_000u128,
        10_000_000u128,
        1_000_000_000u128,
        1_000_000_000_000_000_000u128,
        u64::MAX as u128,
        (u64::MAX as u128) + 1,
        1u128 << 120,
        u128::MAX - 1,
        u128::MAX,
    ];

    for &r_in in &boundary_values {
        for &r_out in &boundary_values {
            for &amount_in in &boundary_values {
                for fee_bps in [0u32, 1u32, 30u32, 9999u32, 10_000u32, 10_001u32, u32::MAX] {
                    // This must never panic, regardless of input values
                    let _ = calculate_swap_amount_out(r_in, r_out, amount_in, fee_bps);
                }
            }
        }
    }

    // 5,000 completely arbitrary u128 tuples
    for _ in 0..5000 {
        let r_in = rng.next_u128();
        let r_out = rng.next_u128();
        let amount_in = rng.next_u128();
        let fee_bps = rng.next_u64() as u32;

        let _ = calculate_swap_amount_out(r_in, r_out, amount_in, fee_bps);
    }
}

#[test]
fn test_mul_u128_and_div_u256_by_u128() {
    // Basic multiplication and division round-trips
    let a = 12345678901234567890u128;
    let b = 98765432109876543210u128;
    let (hi, lo) = mul_u128(a, b);

    let div_b = div_u256_by_u128(hi, lo, b).unwrap();
    assert_eq!(div_b, a);

    let div_a = div_u256_by_u128(hi, lo, a).unwrap();
    assert_eq!(div_a, b);

    // Extreme multiplication: u128::MAX
    let max = u128::MAX;
    let (hi_max, lo_max) = mul_u128(max, max);
    assert_eq!(hi_max, max - 1);
    assert_eq!(lo_max, 1);

    // Division by zero returns None
    assert_eq!(div_u256_by_u128(hi, lo, 0), None);
}
