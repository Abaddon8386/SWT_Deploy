package com.swp391.scms.shop;

import com.swp391.scms.shop.entity.ProductCategory;
import com.swp391.scms.shop.repository.ProductCategoryRepository;
import com.swp391.scms.shop.repository.ProductRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProductSeederTest {
    final ProductCategoryRepository categories = mock(ProductCategoryRepository.class);
    final ProductRepository products = mock(ProductRepository.class);

    @Test
    void doesNothingWhenFlagIsDisabled() {
        ShopProperties props = new ShopProperties();
        props.setSeedSamples(false);
        ProductSeeder seeder = new ProductSeeder(props, categories, products);

        seeder.run(new DefaultApplicationArguments());
        verify(products, never()).save(any());
    }

    @Test
    void doesNothingWhenProductsAlreadyExist() {
        ShopProperties props = new ShopProperties();
        props.setSeedSamples(true);
        when(products.count()).thenReturn(2L);
        ProductSeeder seeder = new ProductSeeder(props, categories, products);

        seeder.run(new DefaultApplicationArguments());
        verify(products, never()).save(any());
    }

    @Test
    void seedsSixSampleProductsWhenEnabledAndDatabaseIsEmpty() {
        ShopProperties props = new ShopProperties();
        props.setSeedSamples(true);
        when(products.count()).thenReturn(0L);
        when(categories.findBySlug(any())).thenReturn(Optional.empty());
        when(categories.save(any())).thenAnswer(inv -> {
            ProductCategory c = inv.getArgument(0);
            c.setId(1L);
            return c;
        });

        ProductSeeder seeder = new ProductSeeder(props, categories, products);
        seeder.run(new DefaultApplicationArguments());

        verify(categories, times(6)).save(any());
        verify(products, times(6)).save(any());
    }
}
