package com.swp391.scms.facilities;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.swp391.scms.facilities.dto.CatalogResponses.DisciplineDto;
import com.swp391.scms.facilities.dto.CatalogResponses.PackageDto;
import com.swp391.scms.facilities.dto.CatalogResponses.RoomDto;
import com.swp391.scms.facilities.service.DisciplineService;
import com.swp391.scms.facilities.service.PackageService;
import com.swp391.scms.facilities.service.RoomService;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CatalogSeederTest {

    @Mock DisciplineService disciplines;
    @Mock RoomService rooms;
    @Mock PackageService packages;
    @InjectMocks CatalogSeeder seeder;

    @Test
    void seedsEmptyCatalogs() {
        when(disciplines.list()).thenReturn(List.of());
        when(rooms.list()).thenReturn(List.of());
        when(packages.list()).thenReturn(List.of());

        seeder.run(null);

        verify(disciplines, times(5)).create(any());
        verify(rooms, times(5)).create(any());
        verify(packages, times(9)).create(any());
        var requests = org.mockito.ArgumentCaptor.forClass(com.swp391.scms.facilities.dto.CatalogRequests.PackageRequest.class);
        verify(packages, times(9)).create(requests.capture());
        org.assertj.core.api.Assertions.assertThat(requests.getAllValues().stream().map(r -> r.price().intValue()).toList())
                .containsExactly(199000, 299000, 599000, 999000, 1499000, 2999000, 1799000, 2699000, 5399000);
    }

    @Test
    void doesNotSeedExistingCatalogs() {
        when(disciplines.list()).thenReturn(List.of(new DisciplineDto(1L, "Yoga", null)));
        when(rooms.list()).thenReturn(List.of(new RoomDto(1L, "S", null, 1, "available")));
        when(packages.list()).thenReturn(List.of(new PackageDto(1L, "P", null, BigDecimal.ONE, 1, null, "active")));

        seeder.run(null);

        verify(disciplines, never()).create(any());
        verify(rooms, never()).create(any());
        verify(packages, times(9)).create(any());
    }
    @Test
    void correctsOriginalCatalogPricesWithoutChangingTermsOrManagerPrices() {
        when(disciplines.list()).thenReturn(List.of(new DisciplineDto(1L, "Yoga", null)));
        when(rooms.list()).thenReturn(List.of(new RoomDto(1L, "S", null, 1, "available")));
        when(packages.list()).thenReturn(List.of(
                new PackageDto(1L, "The Essential", "8 classes", new BigDecimal("2800000"), 30, 8, "active"),
                new PackageDto(2L, "The Sanctuary VIP", "Unlimited", new BigDecimal("7500000"), 90, null, "active"),
                new PackageDto(3L, "The Sovereign Annual", "Annual", new BigDecimal("26000000"), 365, null, "active"),
                new PackageDto(4L, "Manager package", null, new BigDecimal("450000"), 45, 3, "active")));
        seeder.run(null);
        var requests = org.mockito.ArgumentCaptor.forClass(com.swp391.scms.facilities.dto.CatalogRequests.PackageRequest.class);
        verify(packages, times(3)).update(any(), requests.capture());
        org.assertj.core.api.Assertions.assertThat(requests.getAllValues().stream().map(r -> r.price().intValue()).toList())
                .containsExactly(299000, 499000, 999000);
        org.assertj.core.api.Assertions.assertThat(requests.getAllValues().stream().map(r -> r.durationDays()).toList())
                .containsExactly(30, 90, 365);
        org.assertj.core.api.Assertions.assertThat(requests.getAllValues().getFirst().classCreditLimit()).isEqualTo(8);
    }

    @Test
    void preservesManagerChangesToSeededPackage() {
        when(disciplines.list()).thenReturn(List.of(new DisciplineDto(1L, "Yoga", null)));
        when(rooms.list()).thenReturn(List.of(new RoomDto(1L, "S", null, 1, "available")));
        when(packages.list()).thenReturn(List.of(new PackageDto(1L, CatalogSeeder.SILVER_NAME,
                "Manager terms", new BigDecimal("450000"), 45, 3, "inactive")));
        seeder.run(null);
        verify(packages, never()).update(any(), any());
    }
}
