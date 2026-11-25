UPDATE `notification_captures`
SET `field_origins` = json_set(
	coalesce(`field_origins`, '{}'),
	'$.merchantName',
	coalesce(json_extract(`field_origins`, '$.merchantName'), 'legacy_unknown'),
	'$.description',
	coalesce(json_extract(`field_origins`, '$.description'), 'legacy_unknown'),
	'$.paymentMethod',
	coalesce(json_extract(`field_origins`, '$.paymentMethod'), 'legacy_unknown'),
	'$.categoryId',
	coalesce(json_extract(`field_origins`, '$.categoryId'), 'legacy_unknown')
)
WHERE
	`field_origins` IS NULL
	OR json_extract(`field_origins`, '$.merchantName') IS NULL
	OR json_extract(`field_origins`, '$.description') IS NULL
	OR json_extract(`field_origins`, '$.paymentMethod') IS NULL
	OR json_extract(`field_origins`, '$.categoryId') IS NULL;
