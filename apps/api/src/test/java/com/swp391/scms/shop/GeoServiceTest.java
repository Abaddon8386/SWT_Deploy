package com.swp391.scms.shop;

import com.swp391.scms.shop.service.GeoService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class GeoServiceTest {
    final GeoService geo = new GeoService(new com.fasterxml.jackson.databind.ObjectMapper());

    @Test
    void loadsThirtyFourProvincesWithWards() {
        assertThat(geo.provinces()).hasSize(34);
        var first = geo.provinces().getFirst();
        assertThat(geo.wards(first.code())).isNotEmpty();
    }

    @Test
    void resolvesOnlyMatchingProvinceAndWard() {
        var p = geo.provinces().getFirst();
        var w = geo.wards(p.code()).getFirst();
        assertThat(geo.resolve(p.code(), w.code())).get()
                .extracting(GeoService.ResolvedRegion::wardName).isEqualTo(w.name());
        var other = geo.provinces().get(1);
        assertThat(geo.resolve(other.code(), w.code())).isEmpty();
        assertThat(geo.wards("nope")).isEmpty();
    }
}
