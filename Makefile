.PHONY: smoke regression integration certify browser

smoke:
	@bash tests/runners/regression.sh smoke

regression:
	@bash tests/runners/regression.sh regression

integration:
	@bash tests/runners/regression.sh integration

certify:
	@bash tests/runners/regression.sh certify

browser:
	@cd frontend && npm run test:e2e
