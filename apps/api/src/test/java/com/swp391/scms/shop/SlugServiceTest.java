package com.swp391.scms.shop;

import com.swp391.scms.shop.service.SlugService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SlugServiceTest {
    @Test
    void slugifyHandlesVietnamese() {
        assertThat(SlugService.slugify("Sữa Whey Đạm Tách Béo – Vị Sô-cô-la"))
                .isEqualTo("sua-whey-dam-tach-beo-vi-so-co-la");
        assertThat(SlugService.slugify("  Điện Giải Đậm Đặc 100%  "))
                .isEqualTo("dien-giai-dam-dac-100");
    }
}
