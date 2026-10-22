#[cfg(test)]
mod tests {
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

    use crate::asset_registry::{
        AssetCategory, AssetRegistryContract, AssetRegistryContractClient, AssetStatus,
        ComplianceStatus, RiskRating,
    };

    fn setup_test_env() -> (Env, AssetRegistryContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, AssetRegistryContract);
        let client = AssetRegistryContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        (env, client, admin)
    }

    #[test]
    fn test_register_new_asset_with_admin_signature() {
        let (env, client, admin) = setup_test_env();

        let asset_code = String::from_str(&env, "USDC");
        let name = String::from_str(&env, "USD Coin");
        let symbol = String::from_str(&env, "USDC");
        let issuer = String::from_str(&env, "GABC");
        let description = String::from_str(&env, "Stablecoin pegged to USD");
        let url = String::from_str(&env, "https://usdc.example");

        let result = client.register_asset(
            &admin,
            &asset_code,
            &name,
            &symbol,
            &issuer,
            &6,
            &AssetCategory::Stablecoin,
            &description,
            &url,
        );

        assert!(result.is_ok());

        let metadata = client.get_asset(&asset_code);
        assert!(metadata.is_ok());
        assert_eq!(metadata.unwrap().asset_code, asset_code);
    }

    #[test]
    fn test_reject_duplicate_asset_identifiers() {
        let (env, client, admin) = setup_test_env();

        let asset_code = String::from_str(&env, "USDC");
        let name = String::from_str(&env, "USD Coin");
        let symbol = String::from_str(&env, "USDC");
        let issuer = String::from_str(&env, "GABC");
        let description = String::from_str(&env, "Stablecoin");
        let url = String::from_str(&env, "https://usdc.example");

        client
            .register_asset(
                &admin,
                &asset_code,
                &name,
                &symbol,
                &issuer,
                &6,
                &AssetCategory::Stablecoin,
                &description,
                &url,
            )
            .unwrap();

        let result = client.register_asset(
            &admin,
            &asset_code,
            &name,
            &symbol,
            &issuer,
            &6,
            &AssetCategory::Stablecoin,
            &description,
            &url,
        );

        assert!(result.is_err());
    }

    #[test]
    fn test_decimal_precision_validation() {
        let (env, client, admin) = setup_test_env();

        let asset_code = String::from_str(&env, "TOKEN");
        let name = String::from_str(&env, "Test Token");
        let symbol = String::from_str(&env, "TKN");
        let issuer = String::from_str(&env, "GDEF");
        let description = String::from_str(&env, "Test token");
        let url = String::from_str(&env, "https://token.example");

        let result = client.register_asset(
            &admin,
            &asset_code,
            &name,
            &symbol,
            &issuer,
            &18,
            &AssetCategory::Other,
            &description,
            &url,
        );

        assert!(result.is_ok());

        let metadata = client.get_asset(&asset_code).unwrap();
        assert_eq!(metadata.decimals, 18);
    }

    #[test]
    fn test_asset_update_authorization() {
        let (env, client, admin) = setup_test_env();

        let asset_code = String::from_str(&env, "TOKEN");
        let name = String::from_str(&env, "Test Token");
        let symbol = String::from_str(&env, "TKN");
        let issuer = String::from_str(&env, "GDEF");
        let description = String::from_str(&env, "Original description");
        let url = String::from_str(&env, "https://token.example");

        client
            .register_asset(
                &admin,
                &asset_code,
                &name,
                &symbol,
                &issuer,
                &6,
                &AssetCategory::Other,
                &description,
                &url,
            )
            .unwrap();

        let new_name = String::from_str(&env, "Updated Token");
        let new_description = String::from_str(&env, "Updated description");
        let new_url = String::from_str(&env, "https://updated.example");
        let change_reason = String::from_str(&env, "Metadata update");

        let result = client.update_metadata(
            &admin,
            &asset_code,
            &new_name,
            &symbol,
            &issuer,
            &new_description,
            &new_url,
            &change_reason,
        );

        assert!(result.is_ok());

        let metadata = client.get_asset(&asset_code).unwrap();
        assert_eq!(metadata.name, new_name);
        assert_eq!(metadata.description, new_description);
    }

    #[test]
    fn test_query_registered_assets() {
        let (env, client, admin) = setup_test_env();

        let asset1 = String::from_str(&env, "USDC");
        let asset2 = String::from_str(&env, "EURC");

        client
            .register_asset(
                &admin,
                &asset1,
                &String::from_str(&env, "USD Coin"),
                &String::from_str(&env, "USDC"),
                &String::from_str(&env, "GABC"),
                &6,
                &AssetCategory::Stablecoin,
                &String::from_str(&env, "USD stablecoin"),
                &String::from_str(&env, "https://usdc.example"),
            )
            .unwrap();

        client
            .register_asset(
                &admin,
                &asset2,
                &String::from_str(&env, "EUR Coin"),
                &String::from_str(&env, "EURC"),
                &String::from_str(&env, "GDEF"),
                &6,
                &AssetCategory::Stablecoin,
                &String::from_str(&env, "EUR stablecoin"),
                &String::from_str(&env, "https://eurc.example"),
            )
            .unwrap();

        let assets = client.list_assets();
        assert_eq!(assets.len(), 2);
    }

    #[test]
    fn test_reject_duplicate_symbols() {
        let (env, client, admin) = setup_test_env();

        let asset_code1 = String::from_str(&env, "TOKEN1");
        let asset_code2 = String::from_str(&env, "TOKEN2");
        let symbol = String::from_str(&env, "TKN");
        let issuer1 = String::from_str(&env, "GABC");
        let issuer2 = String::from_str(&env, "GDEF");

        client
            .register_asset(
                &admin,
                &asset_code1,
                &String::from_str(&env, "Token 1"),
                &symbol,
                &issuer1,
                &6,
                &AssetCategory::Other,
                &String::from_str(&env, "First token"),
                &String::from_str(&env, "https://token1.example"),
            )
            .unwrap();

        let result = client.register_asset(
            &admin,
            &asset_code2,
            &String::from_str(&env, "Token 2"),
            &symbol,
            &issuer2,
            &6,
            &AssetCategory::Other,
            &String::from_str(&env, "Second token"),
            &String::from_str(&env, "https://token2.example"),
        );

        assert!(result.is_err());
    }
}
